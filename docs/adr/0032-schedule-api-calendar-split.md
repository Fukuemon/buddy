# ADR-0032: 予定の API の calendar を、結び付け、取り込み、同期、書き出しの 4 つの機能に分ける

## Status

承認

## Context

予定の API の `calendar` は、次の 5 つの理由で変わり、テスト以外のファイルを 33 個持つ。

- 外部のカレンダーの結び付け（`Link`、`Unlink`、`Check`）
- 手動の取り込み（`Preview`、`Import`、`plan.go`）
- 同期の変更の取得（`Syncer`、`sync_repository.go`）
- 取った変更を buddy の予定に当てる規則（`apply.go` の `applier`）
- 書き出し（`Outbox`、`Exporter`、確認が必要な待ちの解決）

Google カレンダーの書き出しと同期を Worker に分ける変更（#593）と、Google カレンダーを予定の正本にする変更（#594）は、同期と書き出しだけを変える。  
1 つのパッケージのままだと、2 つの変更が取り込みと結び付けのファイルと同じパッケージに入り、同じ非公開の型を共有したまま広がる。  
#594 は、同期を「変更の取得」と「取った変更を当てる規則」に分けることを求める。

ADR-0031 で、`calendar` の 10 の操作は、使う依存だけを持つ操作ごとの型になった。  
操作の型は自分の依存だけを持つので、パッケージを分けるときは、操作のファイルを移せば済む。

- ADR-0031: [Go の API の操作を、使う依存だけを持つ操作ごとの型にし、機能のパッケージの App をやめる](0031-go-operation-types.md)

今のコードで 4 つに分けると、2 組のパッケージが互いを import する。

- 同期の適用の規則は、書き出しの待ち（`Export`、`Target`）を読んで、待ちを保留（`Hold`）か解決（`Resolve`）にする。
- 書き出しの確認の解決（`AcceptExport`）は、同期の適用の規則の `acceptSchedule` で、外部のカレンダーの内容を予定に当てる。
- 同期は、取り込みの読み替えの規則（`Classify`、`RuleFromRecurrence`、`serviceKey`、`originalDate`）を使う。取り込みは、同期の `createdVersion` を使う。

この ADR は、次の判断を置き換える。

- ADR-0026 の、予定の API の機能のパッケージを 6 つとする判断
- ADR-0029 の、常駐の処理（`Exporter`、`Syncer`）を、操作と同じ `calendar` のパッケージに置く判断

ADR-0030 の、パッケージをフラットに保ち、ファイルの名前の末尾の語で役割を表す規則は保つ。

## Decision

`calendar` を、次の 4 つの機能のパッケージに分ける。  
3 つの機能（`calendarimport`、`calendarsync`、`calendarexport`）は `calendar` だけを import し、互いには import しない。

| パッケージ | 責務 | 置くもの |
| --- | --- | --- |
| `calendar` | 結び付けたカレンダー、予定の対応、外部の予定と buddy の予定を読み替える規則、書き出しの待ちの記録 | `ExternalCalendar`、`EventLink`、`ImportRun`、Google の口（`EventSource`、`EventWriter`、`Accounts`）、`classify.go`、`recurrence.go`、`eventbody.go`、`Export` と `Target`、結び付けの操作（`ServiceAccount`、`List`、`Check`、`Link`、`Unlink`） |
| `calendarimport` | 期間を決めた手動の取り込み | `Preview`、`Import`、`plan.go` |
| `calendarsync` | 同期の変更の取得と、取った変更を当てる規則 | `Syncer`（取得）、`Applier`（当てる規則）、`AcceptExport` |
| `calendarexport` | buddy の予定の変更の書き出し | `Outbox`、`Exporter`、`ListExportIssues`、`RetryExport` |

- 取り込みと同期の両方が使う読み替えの規則（`Classify`、`RuleFromRecurrence`、`serviceKey`、`originalDate`、`createdVersion`）は、`calendar` に置いて公開する。
  - 外部の予定と buddy の予定を互いに読み替える規則は、取り込み、同期、書き出しの 3 つの機能の共通の規則であるためである。
- 書き出しの待ちの記録（`Export`、`Target`、`ExportStatus`、`ExportErrorCode`）は `calendar` に置く。
  - 同期は、書いている途中の待ちを見て、外部の変更を当てるか保留にするかを決める。待ちの記録は、書き出しと同期が共有する状態であるためである。
- `AcceptExport` は `calendarsync` に置く。
  - `AcceptExport` は、確認が必要な待ちを、外部のカレンダーの今の内容を buddy の予定に当てて解決する。外部の内容を当てる操作なので、同期の適用の規則と同じパッケージに置く。
  - 書き出しの待ちの一覧（`ListExportIssues`）と書き直し（`RetryExport`）は、buddy の内容を書く側なので `calendarexport` に残す。

同期は、取得と、当てる規則の 2 つの型に分ける。

- `Syncer` は、同期の状態の Claim と Finish、`EventSource` の変更の読み取り、syncToken の失効（410）の読み直しを持つ。正本のモードを知らない。
- `Applier` は、1 つの外部の予定を 1 つのトランザクションで当てるインターフェースにする。
  - 今の `applier` は、外部の変更と buddy の予定を比べて当てる `ReconcileApplier` にする。
  - Google カレンダーを正本にする事業所の予定の参照のモデルを書く `ProjectionApplier` は、#594 の実装で足す。参照のモデルの配置先は、#612 の ADR で決める。
- `Syncer` は、1 つの予定を当てるトランザクションの中で事業所の正本のモードを読み、モードごとの `Applier` を選ぶ。
  - モードごとの `Applier` は、組み立ての場所が `Syncer` に渡す。`Syncer` はモードの値と `Applier` の対応だけを持ち、モードごとの規則を持たない。
  - 正本のモードの値と、`migrating` のときに当てるかは、#594 の ADR で決める。

`calendarexport` は、事業所の正本のモードが buddy を正本にするときだけ書く。

- `Outbox` は、予定を書くトランザクションの中で事業所のモードを読み、buddy を正本にしないモードなら待ちを積まない。
- `Exporter` は、取った待ちの事業所のモードが buddy を正本にしないモードなら、外部のカレンダーに書かずに待ちを保留にする。
- プロセスの全体にかかる設定のフラグ（`GOOGLE_CALENDAR_EXPORT_ENABLED`）は残す。フラグとモードの両方が許すときだけ書き、フラグを誤って有効にしても、正本と逆の向きに書かない。

予定の対応（`EventLink`）を書くインターフェースは、ADR-0029 の大きさの規則のまま、使う側のパッケージで使うメソッドだけを並べる。

- ADR-0029: [予定の API の機能のパッケージの中で、操作でないファイルとテストの配置先と、ほかの機能を書くインターフェースの大きさを決める](0029-schedule-api-feature-package-layout.md)
- 予定の対応を書くメソッドは、それぞれの `calendar_port.go` に、次のとおり並べる。
  - `calendarimport`: `CreateLink`
  - `calendarsync`: `CreateLink`、`UpdateLink`
  - `calendarexport`: `CreateLink`、`UpdateLink`、`DeleteLink`
- 書き出しの待ちのリポジトリのメソッドも、使う側に並べる。
  - `calendarsync`: `Open`、`Hold`、`Resolve`、`Retry`
  - `calendarexport`: `Enqueue`、`Claim`、`Finish`、`Get`、`ListIssues`、`Retry`
- `calendar` の `Repository` は、結び付けたカレンダーの読み書きだけを持つ。取り込みの記録（`CreateRun`、`FinishRun`、`RunningSince`）は `calendarimport` の、`LinkByEvent` は `calendarsync` のインターフェースに移す。
- postgres の実装は 1 つのまま、それぞれのインターフェースを満たす。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 4 つの機能に分け、読み替えの規則と書き出しの待ちの記録を `calendar` に置き、`AcceptExport` を `calendarsync` に置く | 3 つの機能が互いを import しない。#593 は同期と書き出しの起動だけ、#594 は `Applier` の追加と書き出しの条件だけを変える | `calendar` が読み替えの規則を持ち、公開の型と関数が増える。`httpapi` の `CalendarApp` は、4 つのパッケージの操作を入れる |
| 4 つに分け、`AcceptExport` を `calendarexport` に置き、`calendarexport` が `calendarsync` を import する | 書き出しの待ちの操作が 1 つのパッケージに集まる | 同期が書き出しの待ちを読むので、`Export` の記録を `calendar` に置いても `calendarexport` から `calendarsync` への向きが残る。#594 で同期を変えると書き出しも変わる |
| 1 つのパッケージのまま、ファイルの名前の先頭で `import_`、`sync_`、`export_` に分ける | import のパスが変わらない | ADR-0030 の末尾の語の規則と合わない。非公開の型の共有が残り、変更の広がりは減らない |
| `calendar` の下にサブパッケージ（`calendar/sync` など）を置く | ディレクトリで束ねて読める | ADR-0030 のフラットの規則を置き換える。depguard の規則のパターンが増える |

## Consequences

### Positive

- #593 の Worker は、`calendarsync` の `Syncer` と `calendarexport` の `Exporter` だけを作る。
- #594 は、`calendarsync` に `ProjectionApplier` を足し、`calendarexport` に正本のモードの条件を足す。`ReconcileApplier` は変わらない。
- 同期の適用の規則を組み立てる場所が 1 つになり、`calendar.App` と `Syncer` が `applier` を別々に組み立てて、繰り返しの予定のリポジトリを片方だけ渡さない形が無くなる。

### Negative

- `calendar` の非公開の型と関数（`active`、`source`、`createdVersion`、`serviceKey`、`originalDate`）を公開にする。
- `httpapi`、`postgres`、`inmem`、`access`、`cmd/api` の import を直す。`context/codebase.md` の機能の一覧と順、depguard の設定、`calendar` の Design Doc を直す。
- 1 つの postgres の実装が、4 つのパッケージのインターフェースを満たす。
