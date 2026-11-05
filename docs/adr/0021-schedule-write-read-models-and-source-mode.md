# ADR-0021: 予定の書き込みのモデルと読み取りのモデルを分け、正本のモードを事業所の状態にする

## Status

承認

## Context

Google カレンダーを予定の正本にする変更（#594）では、Google カレンダーを正本にする事業所の予定を、buddy の予定のテーブルではなく参照のモデル（Projection）に持つ。  
その事業所では、予定の API から予定を書けないようにする。UI だけでなく API でも拒む。

今の予定の API には、次の 3 つの制約がある。

- 予定のリポジトリの `GetForUpdate` は、書き込みの前の確認なのに、種類、職員、訪問の情報の名前を結合した表示の `Detail` を返す。
  - `schedule.Detail` は、`calendar` の取り込みと書き出し、`httpapi`、`access`、`postgres`、`inmem` が使う。
- ADR-0005 は、表示のための読み出しを別のパッケージに分ける案を、今の規模では見合わないとして却下した。
  - ADR-0005: [予定の API を機能ごとのパッケージに分け、Go の API の操作を使う依存だけを持つ型にし、ファイルの名前の末尾の語で役割を表す](0005-schedule-api-packages.md)
  - Projection が別のテーブルになると、表示の読み出しは 2 つのテーブルから同じ形を返すことになり、この判断の前提が変わる。
- 予定を書いてよいかの条件は、プロセスの全体にかかる設定のフラグ（`GOOGLE_CALENDAR_EXPORT_ENABLED`）にしかない。事業所ごとの正本のモードを置く場所が無い。

事業所の行のロックは、`organization` に移し、職員の状態の変更と予定と担当の割り振りが同じロックを使う形にすると決めている（#615）。

## Decision

予定の書き込みのモデルを `schedule` に残し、画面と照合が読む読み取りのモデルを、新しい機能のパッケージ `scheduleview` に分ける。  
正本のモードを `organization` の事業所の状態にし、予定を書く操作はトランザクションの中で事業所のモードを確認する。

書き込みのモデルと読み取りのモデルは、次のとおり分ける。

- `schedule` は、buddy を正本にする事業所の予定を書く。予定の作成、変更、キャンセル、繰り返しの予定と回の置き換えの操作を持つ。
  - `GetForUpdate` は、名前を結合しない書き込みのモデル（`Schedule` と更新の番号）を返す。
  - 予定の閲覧と編集の判定と、見てよい職員の絞り込みは、ADR-0005 のまま `schedule` の 1 つのファイルに置き、公開する。
- `scheduleview` は、予定の 1 件と一覧を読む操作（今の `schedule` の `Get`、`GetRecurring`、`List`）を持つ。
  - 名前を結合した表示の型（今の `Detail`、`RecurringDetail`、`Listing`）を `scheduleview` に移す。
  - 事業所のモードで、buddy の予定のテーブルか Projection のテーブルを読み、同じ型を返す。画面と照合は、どちらから読んだかを知らない。
  - 閲覧の判定と絞り込みは、`schedule` の公開の関数を呼ぶ。規則を 2 か所に書かない。
- Projection は、Google カレンダーの同期の適用の規則（`calendarsync` の `ProjectionApplier`）だけが書き、`scheduleview` だけが読む。
  - `ProjectionApplier` だけが書く判断は、ADR-0026 で置き換えた。予定の API の書き込みも、Google に書いた予定を写す。2 つが写す順は、Google の更新の時刻で決める。
    - ADR-0026: [Google カレンダーを正本にする事業所でも、buddy は予定を Google カレンダーへ同期の呼び出しで書き、訪問の情報を buddy の DB に持つ](0026-google-primary-write-through.md)
  - Projection のテーブルと、保存する項目は、#594 の ADR と実装で決める。
- 予定の種類のマスタ（`ListTypes`）は、予定を書くときの参照なので `schedule` に残す。
- 機能の順は、`schedule`、`scheduleview`、`calendar` の順にする。`scheduleview` は `schedule` まで import してよい。`calendarsync` は Projection を書くために `scheduleview` を import してよい。

正本のモードと、書き込みを拒む規則は、次のとおり置く。

- 正本のモード（`google_primary`、`migrating`、`buddy_primary`）を、`organization` の `Facility` の状態にする。
  - `migrating` をやめ、モードを `google_primary` と `buddy_primary` の 2 つにする判断を、ADR-0023 で決めた。切り替えの途中は、モードではなく切り替えの記録で表す。
    - ADR-0023: [事業所の予定の正本を Google カレンダーから buddy へ段階で切り替え、Google カレンダーを正本にする間は予定を参照のモデルに写す](0023-google-calendar-source-modes.md)
  - モードの遷移の規則（どのモードからどのモードへ移れるか）は `organization` に置く。遷移の条件と手順は #594 の ADR で決める。
- 予定を書く操作は、トランザクションの最初に、事業所の行を共有のロックで読み、`schedule` の規則の関数（`requireWritable(f organization.Facility) error`）でモードを確認する。
  - `buddy_primary` のときだけ書ける。`google_primary` と `migrating` では拒む。
    - この判断は ADR-0026 で置き換えた。`google_primary` の事業所でも、予定の API は予定を Google カレンダーへ書く。
      - ADR-0026: [Google カレンダーを正本にする事業所でも、buddy は予定を Google カレンダーへ同期の呼び出しで書き、訪問の情報を buddy の DB に持つ](0026-google-primary-write-through.md)
    - `open` の切り替えがある `google_primary` の事業所で、切り替えの取り込みだけが書ける例外を、ADR-0023 で足した。
      - ADR-0023: [事業所の予定の正本を Google カレンダーから buddy へ段階で切り替え、Google カレンダーを正本にする間は予定を参照のモデルに写す](0023-google-calendar-source-modes.md)
  - モードの切り替えは、同じ事業所の行を排他のロックで取る。切り替えの途中の書き込みは、切り替えの後に入り、切り替えの前のモードで書かれない。
  - 規則は 1 つの関数で、テストに DB とフェイクが要らない。
- 手動の取り込み（`calendarimport`）と、外部の変更を当てる同期（`calendarsync` の `ReconcileApplier`）も、buddy の予定のテーブルを書く前に同じ規則を呼ぶ。
- `scheduleview` は、`buddy_primary` では buddy の予定のテーブルを、`google_primary` と `migrating` では Projection を読む。
- 正本のモードは事業所ごとに持つ。#594 が、正本を切り替える単位を事業所にする案を基本にしているためである。

#594 の要求のうち、次の 3 つは、この配置の上に #594 の ADR と実装で決める。

- #594 は、buddy を正本にした後も、Google カレンダーでの変更を buddy の予定に自動で取り込まないとする。`buddy_primary` で同期が `ReconcileApplier` を使うかは、#594 の ADR で決める。
- `scheduleview` は、Projection の予定にも、buddy の予定と同じ閲覧の判定と事業所の分離を当てる。Projection の予定を職員に結び付ける項目は、#594 の ADR で決める。
- #594 は、最新でない予定を最新であるかのように表示しないことを求める。`scheduleview` が Projection を読むときに、同期の最終の成功時刻を一緒に返すかは、#594 の ADR で決める。

3 つと、モードの遷移の条件と手順は、ADR-0023 で決めた。

- ADR-0023: [事業所の予定の正本を Google カレンダーから buddy へ段階で切り替え、Google カレンダーを正本にする間は予定を参照のモデルに写す](0023-google-calendar-source-modes.md)

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** `schedule` を書き込みのモデル、`scheduleview` を読み取りのモデルの機能にし、正本のモードを事業所の状態にして、予定を書く操作が共有のロックの中で確認する | 読み取りのモデルを分けるのは、Projection が要る予定だけになる。画面と照合は読み元を知らない。モードの切り替えと書き込みが同じ行のロックで並ぶ | ADR-0005 の表示の読み出しの却下を置き換える。予定を書く操作に、同じ 1 行の確認を足す。`httpapi` は、書いた後の予定を `scheduleview` から読む |
| `schedule` の中で、リポジトリを書くインターフェースと読むインターフェースの 2 つに分け、Projection も `schedule` に置く | パッケージが増えない | `schedule` が Projection の規則まで持ち、変わる理由が増える |
| Google カレンダーを正本にする事業所の予定も buddy の予定のテーブルに書き、正本を表すカラムで区別する | テーブルと読む処理が今のまま | 書き込みのモデルの不変条件（職員の割り振り、訪問の情報の参照）を Projection の予定が満たせず、確認を外す分岐が書き込みのモデルに入る |
| HTTP のミドルウェアで、予定を書くパスを事業所のモードで拒む | 機能のパッケージが変わらない | 取り込みと同期からの書き込みを止められない。パスの一覧とモードの規則を `httpapi` が持つ |
| DB のトリガーか制約で、Google カレンダーを正本にする事業所の予定の行への書き込みを拒む | どこから書いても止まる | 規則が SQL にあり、エラーを業務の文にできない。テストに DB が要る |

- 出典: [Fowler: CQRS](https://martinfowler.com/bliki/CQRS.html)

## Consequences

### Positive

- #594 の Projection は、`calendarsync` の `ProjectionApplier` と `scheduleview` に閉じる。書き込みのモデルと `ReconcileApplier` は変わらない。
- 予定を書けるかの規則が 1 つの関数にあり、API、取り込み、同期のどこから書いても同じ規則で拒む。
- 書き込みの前の確認が、表示のための名前の結合を読まなくなる。

### Negative

- `schedule.Detail` を使う `calendar`、`httpapi`、`access`、`postgres`、`inmem` の import と型を直す。書き込みのモデルで足りる箇所と、表示の型が要る箇所を、実装の issue で分ける。
- 予定を書く 5 つの操作と、取り込みと同期の書き込みに、モードの確認を足す。
- `httpapi` は、予定を書いた後の応答を `scheduleview` の 1 件の読み出しで作る。書き込みと読み出しは別のトランザクションになる。
