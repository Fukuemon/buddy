# ADR-0035: 事業所の予定の正本を Google カレンダーから buddy へ段階で切り替え、Google カレンダーを正本にする間は予定を参照のモデルに写す

## Status

承認

## Context

職員は予定を Google カレンダーで管理している。  
buddy を初めから予定の正本にし、Google カレンダーと双方を編集できるようにすると、二重の管理、衝突の解決、同期の失敗のときの運用が複雑になる。  
そこで、Google カレンダーを正本にして buddy の表示と照合を使い、定着した事業所から buddy へ正本を切り替える。

ADR-0009 は、buddy の DB を正本にし、取り込み、書き出し、双方向の同期の 3 つの段階を足すと決めた。3 つとも実装してある。

- ADR-0009: [Google カレンダーとの連携を、buddy をマスターにする段階の同期にし、サービスアカウントとカレンダーの共有で認証する](0009-google-calendar-sync.md)

ADR-0032 と ADR-0033 は、この ADR が前提にする配置を決めた。

- 同期は、変更の取得（`calendarsync` の `Syncer`）と、取った変更を当てる規則（`Applier`）に分かれる。
  - ADR-0032: [予定の API の calendar を、結び付け、取り込み、同期、書き出しの 4 つの機能に分ける](0032-schedule-api-calendar-split.md)
- 正本のモードは事業所の状態で、予定を書けるのは `buddy_primary` の事業所だけである。表示の読み出し（`scheduleview`）は、モードで読み元を選ぶ。
  - ADR-0033: [予定の書き込みのモデルと読み取りのモデルを分け、正本のモードを事業所の状態にする](0033-schedule-write-read-models-and-source-mode.md)

決定に関わる事実は次のとおり。

- 今の同期は、職員のカレンダーごとに `syncToken` で変わった予定を読む。繰り返しの予定は展開せずに読む（`singleEvents=false`）。`syncToken` が切れると 410 を返し、全件を読み直す。
  - 出典: [Synchronize resources efficiently](https://developers.google.com/workspace/calendar/api/guides/sync)
- 今の同期は、予定の対応（`EventLink`）がある予定だけに当て、Google カレンダーで新しく作った予定は手動の取り込みを待つ。
- 職員、利用者、訪問の情報、権限は buddy の DB にある。Google カレンダーは、これらの正本にしない。
- 照合の API は、予定の CSV か、Google カレンダーを直接読む。
- buddy は公開する前で、運用している事業所の予定は無い。

## Decision

### 正本のモードと遷移

事業所の正本のモードを、`google_primary`、`migrating`、`buddy_primary` の 3 つにする。

| モード | 予定の正本 | 予定の API からの書き込み | 同期 | 書き出し | 画面と照合が読むもの |
| --- | --- | --- | --- | --- | --- |
| `google_primary` | Google カレンダー | 拒む | Google の変更を Projection に写す | しない | Projection |
| `migrating` | Google カレンダー | 手動の取り込みだけ | Google の変更を Projection に写す | しない | Projection |
| `buddy_primary` | buddy | 書ける | しない | buddy から Google へ一方向 | buddy の予定 |

- 遷移は、`google_primary` から `migrating`、`migrating` から `buddy_primary`、`migrating` から `google_primary`（戻す）の 3 つだけにする。
  - `buddy_primary` から戻す遷移は持たない。Google カレンダーでの緊急の編集を正本に取り込む運用と衝突の解き方は、別の要求で決める（#594 の範囲外）。
- 遷移は、事業所で職員の管理の権限（`staff.manage`）を持つ職員が、予定の API で行う。遷移は事業所の行を排他のロックで取り、予定の書き込みと直列にする（ADR-0033）。
- 新しい事業所のデフォルトのモードは `google_primary` にする。マイグレーションは、今ある事業所を `buddy_primary` にし、今の動作を変えない。ローカル環境と E2E のシードの事業所は `buddy_primary` にし、`google_primary` の確認のための事業所を別に足す。

### 正本を buddy に切り替える手順（`migrating`）

1. `google_primary` から `migrating` に移す。事業所の結び付けたカレンダーが全て、最後の同期を失敗なく終えていることを条件にする。
   - `migrating` に入った時点で、予定の API からの書き込みは止まる（ADR-0033 の `requireWritable`）。
2. 最後の差分を取る。`migrating` に入った後に始めた同期が、事業所の全てのカレンダーで成功して終わるのを待つ。
3. 取り込む。マネージャーが、今の取り込みの画面（`calendarimport` のプレビューと確定）で、カレンダーごとに、切り替えの月の初日から Projection を保持する期間の終わりまでを取り込む。
   - `migrating` では、手動の取り込みだけが buddy の予定のテーブルを書ける。ADR-0033 の「`buddy_primary` のときだけ書ける」の例外にする。
   - 取り込みの確認が必要な予定（訪問の情報に読み替えられない予定など）は、今の取り込みと同じく、マネージャーが取り込むか取り込まないかを決める。
4. 整合性を確認する。事業所の全てのカレンダーについて、次の 3 つを満たすときだけ、`buddy_primary` に移せる。
   - 手順 2 の後に、同期が成功している。
   - 取り込みの期間の Projection の予定が、全て、予定の対応を持つか、取り込みで取り込まないと決めた予定である。
   - 取り込んだ後に Projection の予定が変わっていない。予定の対応の etag と Projection の etag が同じである。
   - 満たさない予定の一覧を、遷移を拒む応答に入れて返す。マネージャーは取り込みをやり直す。
5. `buddy_primary` に移す。事業所の Projection の行を消し、同期をやめ、書き出しを始める。
- 失敗したときは、`migrating` から `google_primary` に戻す。この切り替えの取り込みで作った buddy の予定と予定の対応を消す。`migrating` の間は予定の API から書けないので、消しても職員の変更は失われない。Projection は切り替えの間も同期で保っているので、戻した後も同じ予定が見える。
  - 切り替えの取り込みを後から特定できるよう、取り込みの記録（`ImportRun`）に切り替えの記録の ID を持たせる。

### モードごとの同期と書き出し

- `google_primary` と `migrating` では、`Syncer` は `ProjectionApplier` で Google カレンダーの変更を Projection に写す。予定の対応の有無によらず、新しく作った予定も写す。
- `buddy_primary` では、`Syncer` はその事業所のカレンダーを読まない。Google カレンダーでの変更は buddy に取り込まない。
  - ADR-0032 が `buddy_primary` で使うとした `ReconcileApplier` は、どのモードでも使わない。コードは消さず、緊急の編集の要求で使い道を決める。
  - `buddy_primary` の書き出しは、buddy の内容を Google カレンダーに書く。Google カレンダーでの変更と衝突したとき（412）は、今と同じく確認が必要な予定にし、マネージャーは buddy の内容で書き直す（`RetryExport`）。Google の内容を当てる操作（`AcceptExport`）は、`buddy_primary` では拒む。
- `Syncer` は、1 つの予定を当てるトランザクションの中で事業所のモードを読み、`ProjectionApplier` を使うか読まないかを決める（ADR-0032）。

### Projection

Projection は、Google カレンダーを正本にする事業所の予定の写しで、`calendarsync` の `ProjectionApplier` だけが書き、`scheduleview` だけが読む（ADR-0033）。

- テーブルは `calendar_event_projections` にし、Google カレンダーの 1 つの予定を 1 行にする。結び付けたカレンダーの ID と Google の予定の ID の組で一意にする。
- 保存する項目は次のとおり。
  - Google の予定の ID、繰り返しの予定の親の ID と元の開始の時刻（例外の回）、状態（確定か取り消し）
  - タイトル、開始と終了（日時か、終日の日付）、繰り返しの規則（RRULE）
  - etag、Google での更新の時刻、写した時刻
- 保存しない項目は、説明、場所、参加者、作成者と主催者のメール、添付である。タイトルは、利用者名を含むが、表示と照合に要るので保存する。
- 繰り返しの予定は、展開せずに親と例外の回を保存し、`scheduleview` が読む期間の中で展開する。展開には、取り込みと同じ読み替えの規則（`calendar.RuleFromRecurrence`）を使う。展開できない繰り返しの規則の予定は、確認が必要な予定として 1 件で返し、一覧から落とさない。
- 保持する期間は、前々月の初日から 3 か月後の月末までにする。期間より前に終わった予定の行は、同期が消す。照合で前月の予定を読むためである。

### 職員、事業所、閲覧の判定

- Projection の行は、結び付けたカレンダー（`external_calendars`）を通して、職員と事業所に結び付く。行には、写した時点の職員と事業所の ID を持たせ、事業所で絞る読み出しに使う。
- `scheduleview` は、Projection の予定にも、buddy の予定と同じ閲覧の判定（`schedule.Readable`）と事業所の分離を当てる。カレンダーの職員を、予定の職員とみなす。
- Projection の予定の訪問の情報（利用者とサービスコード）は、読み出しのときにタイトルを読み替えて引く（`calendar.Classify`）。引けない予定は、訪問の情報を空にし、理由（利用者が見つからない、サービスコードが見つからない）を付けて返す。

### 同期の状況の返し方と失敗のとき

- `scheduleview` は、Projection を読む一覧に、カレンダーごとの同期の最終の成功時刻と、最後の失敗の理由を一緒に返す。画面は、最終の成功が古いか失敗しているときに、予定が最新でないことを示す。古いとみなす時間は画面で決める。
- Google カレンダーの API の障害、クォータの超過、読めないカレンダーは、今の同期と同じく、カレンダーごとにリースと再試行の回数で読み直し、失敗の理由を同期の状態に残す。1 つの予定の不正で、ほかの予定とカレンダーの同期を止めない。
- `syncToken` が切れたとき（410）は、そのカレンダーの予定を全件読み直し、読み直しに無かった Projection の行を消す。これで、取り消しの取りこぼしを直す。
- 予定のタイトルと利用者名は、ログに書かない。ログには事業所、カレンダー、Google の予定の ID だけを書く。

### 照合

照合の API は、どのモードでも、今のとおり予定の CSV か Google カレンダーを直接読む。

- `google_primary` と `migrating` では、Google カレンダーが正本なので、直接読む予定が正本と一致する。
- `buddy_primary` では、書き出しで Google カレンダーを buddy にそろえる。書き出しが遅れると照合の予定も遅れる。照合の API が予定の API から読む形は、別の要求で決める。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 事業所ごとの 3 つのモードにし、Google を正本にする間は Projection に写し、`migrating` で取り込んで確認してから buddy に切り替える | 正本が常に 1 つである。切り替えに失敗しても、Projection のまま元に戻せる。今の取り込みの画面と規則を切り替えに使える | Projection のテーブルと、それを読む `scheduleview` の処理が増える。切り替えの取り込みはマネージャーの手作業である |
| Google を正本にする間も、Google の予定を buddy の予定のテーブルに自動で取り込み、書き込みだけを止める | 読み出しが 1 つのテーブルで済む | 訪問の情報に読み替えられない予定を書き込みのモデルに入れられず、不変条件を外す分岐が要る（ADR-0033） |
| 画面と照合が Google カレンダーを毎回直接読み、Projection を持たない | テーブルが要らない | 画面の表示のたびに Google の API を呼び、クォータと遅さが画面に出る。Google の障害のときに何も表示できない |
| `buddy_primary` でも、今の双方向の同期で Google の変更を buddy に当てる | 今のコードがそのまま動く | #594 は、切り替えた後に Google の変更を自動で取り込まないとする。正本が 2 つになる |
| 切り替えの単位を職員のカレンダーにする | 一部の職員から先に移せる | 1 つの事業所に正本が 2 つでき、同じ利用者の予定が 2 つの正本に分かれる。照合と画面の読み元が職員ごとに変わる |

## Consequences

### Positive

- 職員は Google カレンダーで予定を管理したまま、buddy の画面で予定を見られる。新しく作った予定も、手動の取り込みを待たずに見える。
- 正本は事業所ごとに常に 1 つで、予定の API はモードで書き込みを拒む。
- 切り替えに失敗しても、`google_primary` に戻せば、職員の予定は Projection のまま残る。

### Negative

- Projection のテーブル、`ProjectionApplier`、`scheduleview` の Projection の読み出しと繰り返しの展開を足す。
- 今の双方向の同期（`ReconcileApplier`）と `AcceptExport` は、`buddy_primary` で使わなくなる。
- 切り替えは、マネージャーが全てのカレンダーを取り込む手作業が要る。
- 遷移の API と、遷移の状況を見る画面を足す。
