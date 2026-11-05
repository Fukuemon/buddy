# ADR-0038: Google カレンダーを正本にする事業所でも、buddy は予定を Google カレンダーへ同期の呼び出しで書き、訪問の情報を buddy の DB に持つ

## Status

提案

## Context

ADR-0035 は、Google カレンダーを予定の正本にする事業所（`google_primary`）では、buddy からの予定の書き込みを拒むと決めた。  
利用者の要求は、`google_primary` の事業所でも、職員が buddy の画面で予定を作成し、変更し、取り消すことである。  
Google カレンダーは正本のままで、Google カレンダーでの変更も今のとおり buddy に反映する。

- ADR-0035: [事業所の予定の正本を Google カレンダーから buddy へ段階で切り替え、Google カレンダーを正本にする間は予定を参照のモデルに写す](0035-google-calendar-source-modes.md)

この ADR は、ADR-0035 の次の判断を置き換える。

- `google_primary` の事業所で、buddy からの書き込みを拒み、書き出しをしない判断
- `ReconcileApplier` のコードを消さずに、緊急の編集の要求で使い道を決める判断
- `AcceptExport` を残す判断
- Projection を `ProjectionApplier` だけが書く判断
- Projection の予定の訪問の情報を、タイトルの読み替えだけで引く判断

ADR-0033 の、予定を書けるのは `buddy_primary` の事業所だけとする判断と、Projection を `ProjectionApplier` だけが書く判断も置き換える。

- ADR-0033: [予定の書き込みのモデルと読み取りのモデルを分け、正本のモードを事業所の状態にする](0033-schedule-write-read-models-and-source-mode.md)

決定に関わる事実は次のとおり。

- 予定の作成、変更、取り消しの API は、`google_primary` の事業所では 409 の `google_primary` で拒む（`schedule.RequireWritable`）。
- `google_primary` の事業所の画面は、同期が写した Projection を読む。Projection は、Google の予定の ID とタイトルと日時と etag を持ち、訪問の情報を構造として持たない。
  - 画面の訪問の情報は、読み出しのときにタイトル `【サービス内容】利用者名` を読み替えて引く（`calendar.Classify`）。主訪問者はカレンダーの職員で、同行者と訪問の区分は持たない。
- 照合の API は、どのモードでも、予定の CSV か Google カレンダーを直接読み、タイトルで利用者とサービスを決める。
- Google カレンダーに書く口（`calendar.EventWriter`）は、作成、部分更新、削除を持つ。更新と削除に `If-Match` の etag を付けると、Google で予定が変わっていたときに Google は 412 を返し、`EventWriter` は `ErrEventChanged` を返す。消された予定への 412 は `ErrEventGone` を返す。
  - 出典: [Version resources](https://developers.google.com/workspace/calendar/api/guides/version-resources)
- `calendar.EventIDOf` は、buddy の予定の ULID から Google の予定の ID を作る。同じ ID の作成は 409（`ErrEventExists`）になるので、書き直しても予定は 2 つにならない。
- `EventWriter` は、404 を `ErrEventNotFound` で返す。書き出しは、カレンダーの共有が外れたときの 404 と予定が無いときの 404 を見分けられないとみなし、404 で予定の対応を消さない。
- ADR-0033 の機能の順は `schedule`、`scheduleview`、`calendar` で、`schedule` は `calendar` を import できない。
- 書き出しの待ち（Outbox）と `Exporter` は、buddy の予定のテーブルの予定を書く。`ReconcileApplier` と `AcceptExport` は、Google の変更を buddy の予定のテーブルに当てる。どれも buddy の予定のテーブルを正本にする前提である。
- 切り替え（`Cutover`）の取り込みは、`open` の間に buddy からの書き込みが止まっていることを前提に、Google の内容で buddy の写しを上書きする。
- buddy は公開する前で、運用している事業所の予定は無い。

## Decision

`google_primary` の事業所でも、予定の API は予定の作成、変更、取り消しを受ける。  
予定の API は、受けた変更をリクエストの中で Google カレンダーに書き、書けたときだけ成功を返す。  
Google カレンダーは予定の日時、タイトル、取り消しの正本のままにし、訪問の情報だけを buddy の DB に持つ。

### 書き込みの向きと失敗の扱い

- `google_primary` の書き込みは、同期の呼び出しで Google カレンダーに書く。Outbox と `Exporter` を使わない。
  - Google が受けるまで、変更は正本に入っていない。後から書く形では、書けなかった変更を buddy のどこかに持ち、職員がいないときに衝突を解く手順が要る。
- Google に書く操作は、新しい機能のパッケージ `calendarwrite` に置く。`calendar`、`scheduleview`、`visit`、`schedule` の閲覧と編集の判定を使う。
  - `httpapi` は、今の予定の作成、変更、取り消しの API のまま、事業所のモードで `schedule` か `calendarwrite` を呼ぶ。API のパスは変えず、作成のリクエストに予定の ID を足す。
- 予定の閲覧と編集の判定は、`buddy_primary` と同じ `schedule` の規則を当て、カレンダーの職員を予定の職員とみなす。
  - 主訪問者に、外していないカレンダーが無いときは、409（`calendar_not_linked`）で拒む。

1 つの書き込みは、次の順に行う。

1. 1 つ目のトランザクションで、事業所の行を共有のロックで読み、`google_primary` で `open` の切り替えが無いことを確認する。訪問の情報の行に、書く内容を保留の版として書く。
2. トランザクションの外で、Google に書く。予定の本文の `extendedProperties.private` に、buddy の予定の ID と保留の版を置く。
3. 書けたら、2 つ目のトランザクションで、Google が返した予定を `ProjectionApplier` と同じ規則で Projection に写し、保留の版を確定する。画面は、同期を待たずに書いた予定を読める。
4. 書けなかったら、保留の版を消し、訪問の情報の行を書く前の内容に戻す。

- 手順 3 のトランザクションが失敗しても、Google には予定がある。同期がその予定を読み、`extendedProperties.private` の版が保留の版と同じなら確定し、違えば保留の版を消す。buddy で入力した訪問の情報は失われない。
- 手順 1 の後に切り替えが始まっても、切り替えの完了の確認が Google の etag と予定の対応を比べるので、取り込みの後に書いた変更を見つける（ADR-0035）。
- 作る予定の ID は、画面が作成のリクエストに付ける buddy の予定の ID（ULID）から `calendar.EventIDOf` で作る。Google に書けたのに応答を受けられず、職員が同じ入力を送り直しても、同じ ID になるので予定は 2 つにならない。
  - 作成が 409（`ErrEventExists`）のときは、Google の予定を読み、`extendedProperties.private` の buddy の予定の ID が同じなら、同じ予定の書き直しとして読んだ etag で更新する。違えば 409 を返す。

`EventWriter` のエラーごとの扱いは次のとおり。

| `EventWriter` のエラー | 予定の API の応答 | 画面の表示 |
| --- | --- | --- |
| 無し | 書いた予定 | 書いた予定 |
| `ErrEventChanged` | 409（`google_event_changed`）。Google の今の予定を Projection に写す | Google カレンダーで変更されたことと最新の予定を示し、入力を残す |
| `ErrEventGone` | 409（`google_event_not_found`）。Projection の行を消す | Google カレンダーで消されたことを示す |
| `ErrEventNotFound` | 409（`google_event_not_found`）。Projection の行を消さない | Google カレンダーで予定が見つからないことを示す |
| `ErrUnavailable` | 503（`google_unavailable`） | 書けなかったことを示し、入力を残す |
| `ErrUnwritable` | 409（`google_calendar_unwritable`） | カレンダーの共有の権限が足りないことを示す |
| `ErrEventRejected` | 409（`google_event_rejected`） | Google カレンダーが予定を受け付けなかったことを示し、入力を残す |

- Google カレンダーが使えない間は、`google_primary` の事業所の予定を buddy から書けない。**この扱いは、利用者の確認が要る。**

### 訪問の情報を buddy の DB に持つ

- 訪問の情報（利用者、主訪問者、同行者、サービスコード、訪問の区分）を、buddy の DB に持つ。行の主キーは buddy の予定の ID にし、結び付けたカレンダーと Google の予定の ID の組を一意のカラムにする。
  - 利用者と職員の参照、事業所の分離、同行者の不変条件を、今の訪問の情報と同じ規則で DB と予定の API が守れる。
- 項目ごとの正本は次のとおり。
  - 日付と時刻、タイトル、取り消しは Google カレンダー
  - 訪問の情報は buddy の DB
- buddy から書くときは、Google のタイトルを今の書き出しと同じ `【サービス内容】利用者名` にする。照合の API は、今のとおりタイトルを読む。
- Google でタイトルを変え、タイトルの利用者かサービス内容が buddy の訪問の情報と違うときは、訪問の情報を消さずに、確認が必要な予定として理由を付けて返す。職員が buddy で直すと、両方がそろう。
- 主訪問者を替えると、予定を新しい職員のカレンダーに移し、訪問の情報の行のカレンダーと Google の予定の ID を書き換える。主キーは変わらない。移す方法（`events.move` か、作り直しか）は実装の issue で決める。
- 訪問の情報の行は、Projection の行と同じ期間だけ残し、Google で取り消した予定の行は消す。
- 照合の API が、構造の訪問の情報（同行者と訪問の区分）を使うには、予定の API から予定を読む形が要る。ADR-0035 が別の要求で決めるとした形で、この ADR では決めない。
  - その要求を決めるまで、照合はタイトルの利用者とサービス内容だけを使い、要求の受け入れ条件の「照合で使える」は、タイトルの 2 つの項目だけで満たす。
  - 照合で過去の月を読み直すために、行を残す期間を延ばすかも、その要求で決める。
  - **照合でどの項目を使うかは、利用者の確認が要る。**

### 両方で同じ予定を変えたとき

- 画面は、読んだ予定の etag を書き込みに付ける。予定の API は、その etag を `If-Match` に付けて Google に書く。
- Google で先に変わっていれば、Google は 412 を返し、予定の API は buddy の変更を書かずに 409 を返す。先に書かれた Google の変更を残し、buddy の変更は職員の画面に入力のまま残る。
  - 職員に知らせずに片方の変更を失うことはない。職員が、その場で最新を見て入力し直す。
  - ADR-0009 の「マネージャーが選ぶ」は、後から書く形で、職員がいないときに見つかる衝突のための手順である。同期の呼び出しでは要らない。
- Projection が古くても、比べるのは Google の etag なので、変更は失われない。409 が増えるだけである。
- **先に書かれた変更を残す規則は、利用者の確認が要る。**

### Google で作った予定

- Google で作った予定は、今のとおりタイトルを読み替えて画面に出す。
- 職員は、その予定を buddy で開いて変更でき、訪問の情報を足して保存できる。保存すると、訪問の情報の行ができる。
- 同期は、Google で作った予定に訪問の情報の行を自動で作らない。タイトルの読み替えは推定で、同行者と訪問の区分を持たないためである。
- **Google で作った予定を buddy で編集できるようにするかは、利用者の確認が要る。**

### 繰り返しの予定

- buddy で作る繰り返しの予定は、今の書き出しと同じ RRULE と `EXDATE` の繰り返しの予定として Google に書く。
- 1 回だけの変更と取り消しは、Google の例外の回として書く。`buddy_primary` の書き出しの、親の `EXDATE` と別の単発の予定にする形は使わない。Google が正本なので、Google の繰り返しの形に合わせる。
- 訪問の情報は親の予定の行に持ち、例外の回で変えたときだけ回の行を足す。

### 今のコードの扱い

- `ProjectionApplier` と Projection は残し、予定の API の書き込みからも Projection を書く。
- `ReconcileApplier` と `AcceptExport` は、どのモードでも使わないので消す。どちらも buddy の予定のテーブルを正本にする前提で、この ADR の書き込みは buddy の予定のテーブルを書かない。
  - `ReconcileApplier` を組み立てるのはテストだけで、`AcceptExport` は `buddy_primary` で拒み、`google_primary` では確認が必要な待ちができない。
  - 消すものは次のとおり。
    - OpenAPI の `createCalendarExportAcceptance` と `httpapi` の口
    - web の呼び出しとモック
    - 確認が必要な予定の画面仕様書の「Google の内容に合わせる」
    - Design Doc の当てる規則の記述
- `calendarexport` の Outbox と `Exporter` は、`buddy_primary` の書き出しに残す。`google_primary` の書き込みは、`calendar.EventWriter` と `EventIDOf` と予定の本文を作る規則（`eventbody.go`）を使う。
- 切り替えは残す。次の 2 つを足す。
  - `open` の切り替えがある事業所では、buddy からの書き込みを 409 で拒む。切り替えの取り込みが、取り込んだ後の Google の変更を上書きする規則が、buddy の書き込みで崩れないためである。
  - 切り替えの取り込みは、訪問の情報の行がある予定では、タイトルの読み替えより訪問の情報の行を使う。buddy で入力した訪問の情報を失わないためである。
- この要求の後も事業所を `buddy_primary` に切り替える運用を続けるかは、利用者の確認が要る。続けないときは、切り替えと `buddy_primary` を消す ADR を別に書く。

## Considered Options

| 選択肢 | 正本が 1 つか | 訪問の情報 | 衝突 | 書き込みの失敗 | 今のコードを使えるか | 運用の手間 |
| --- | --- | --- | --- | --- | --- | --- |
| **採用:** 同期の呼び出しで Google に書き、訪問の情報を buddy の DB に Google の予定の ID で持つ | 予定は Google、訪問の情報は buddy で、項目ごとに 1 つ | 構造のまま持てる | 412 を職員に返し、その場で入力し直す | 職員がその場で見る。Google が使えない間は書けない | Projection、`ProjectionApplier`、`EventWriter`、予定の本文の規則を使う。`ReconcileApplier` を消す | 確認が必要な待ちの一覧を見る手間が無い |
| Outbox で後から Google に書き、buddy の予定のテーブルを経由する（ADR-0009 の双方向） | buddy の予定のテーブルと Google の 2 つ | 構造のまま持てる | 後から見つけ、マネージャーが選ぶ | 職員が書いた後に失敗し、確認が必要な予定に出る | Outbox、`Exporter`、`ReconcileApplier`、`AcceptExport` をそのまま使う | マネージャーが確認が必要な予定を解き続ける。Google で作った予定は取り込みを待つ |
| 同期の呼び出しで Google に書き、訪問の情報を Google の予定の `extendedProperties` に持つ | 全てを Google に持つ | 利用者と職員の ID を Google に置き、DB の参照と事業所の分離を守れない | 採用と同じ | 採用と同じ | 採用と同じ | Google で予定を写したときに ID が古いまま残る |
| 同期の呼び出しで Google に書き、訪問の情報をタイトルだけで表す | 全てを Google に持つ | 同行者と訪問の区分を持てない | 採用と同じ | 採用と同じ | 採用より少ない変更で済む | buddy で入力した訪問の情報が失われる |
| Google を正本にする事業所をやめ、全ての事業所を `buddy_primary` にする | buddy の 1 つ | 構造のまま持てる | 書き出しの 412 をマネージャーが解く | 書き出しの失敗が後から出る | 今の `buddy_primary` をそのまま使う | 職員が Google カレンダーで予定を入れる今の運用を変える |

## Consequences

### Positive

- `google_primary` の事業所の職員が、buddy の画面で予定を作成し、変更し、取り消せる。Google カレンダーは正本のままである。
- 衝突と書き込みの失敗は、書いた職員の画面に出る。マネージャーが後から解く待ちが増えない。
- 訪問の情報を、今の訪問の情報と同じ不変条件で持てる。

### Negative

- Google カレンダーが使えない間は、`google_primary` の事業所の予定を buddy から書けない。
- 予定の項目の正本が、日時とタイトルは Google、訪問の情報は buddy に分かれる。タイトルと訪問の情報が食い違った予定を、確認が必要な予定として出す処理が要る。
- 予定を書く操作が、モードによって、buddy の予定のテーブルに書く操作と、Google カレンダーに書く操作に分かれる。
- 繰り返しの予定の 1 回だけの変更を、Google の例外の回として書く処理を足す。
- 訪問の情報の行に保留の版を持ち、Google に書けなかったときと、書けた後に DB を書けなかったときの戻し方を実装する。
- 作成のリクエストに、画面が作る予定の ID を足す。
