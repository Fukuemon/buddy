# ADR-0023: サービスの規則を packages/go/servicecode に置き、予定の API のサービスコードを visit から servicecode の機能に分ける

## Status

承認

## Context

報酬の改定で変わるサービスの規則（サービスコードの表記と提供時間の範囲）が、2 つの API に分かれている。

- 提供時間の範囲は、照合の API の `servicerule.Lookup` の表と、予定の API のマイグレーションのシード（`service_codes`）の 2 か所にある。
  - シードの注釈は「servicerule に合わせる」と書き、手で同期している。片方を直し忘れても、止めるチェックが無い。
- 別の表記（`予防訪看`、`予訪看`、`I５２超`）は、照合の API の `servicerule` の case と、予定の API の `calendar` の `serviceAliases` の 2 か所で吸収する。
- 表記をそろえる処理（`NormalizeService`）は、カレンダーのタイトルを読み書きする `packages/go/gcaltitle` にある。タイトルの形とサービスの規則が 1 つのパッケージにある。

予定の API の `visit` は、サービスコードと訪問の区分を、マスタとして 1 つのリポジトリ（`MasterRepository`）で読む。

- `patient` が `visit` を import するのは、利用者のデフォルトのサービスコードを確認するためだけである。
- このため、`visit` は利用者を `patient` から直接受けられず、逆向きの関数 `PatientFinder` で受け、`cmd/api` が `patient.VisitFinder` でつなぐ。

この ADR は、次の 2 つの判断を置き換える。

- ADR-0010 の、2 つの API が共有するのはトークンの検証、テストのフェイク、ヘルスチェックのような基盤のコードだという前提。業務の規則も共有の範囲に入れる。
  - ADR-0010: [2 つの Go の API が共有するコードを、別の module にまとめる](0010-go-shared-module.md)
- ADR-0021 の、機能のパッケージの一覧のうち、サービスコードを `visit` に置く部分。機能の間の import の順は `context/codebase.md` の規則を直す。
  - ADR-0021: [予定の API を機能ごとのパッケージに分ける](0021-schedule-api-packages.md)

## Decision

### packages/go/servicecode

サービスの規則を、共有の module の `packages/go/servicecode` に置き、照合の API と予定の API が使う。

`servicecode` が持つものは、次の 3 つ。

| 持つもの | 今の場所 |
| --- | --- |
| 表記をそろえる処理（`Ⅰ` と `1` を `I` に、`･` を `・` に、半角の数字を全角に） | `gcaltitle.NormalizeService` |
| 別の表記を、サービスコード表の表記にそろえる処理（`予防訪看` と `予訪看`、`I５２超`） | `servicerule` の case と `calendar` の `serviceAliases` |
| サービス内容ごとの提供時間の範囲の表と、表を引く前の処理（`基本療養費` か `難病等複数回訪問` を含むサービス内容をその語の行に寄せ、`・夜` と `・深` を外す） | `servicerule.Lookup` |

`servicecode` が持たないものは、次のとおり。

- 照合だけの規則。照合の API の `servicerule` に残し、`servicecode` を使って書き直す。
  - 予定の終了時間から 1 分引くサービス内容（`HasScheduleEndAdjustment`）
  - 予定と実績のサービス内容の対応（`IsMatchingService`）
- カレンダーのタイトルの形（`【サービス内容】利用者名`）。`gcaltitle` に残す。
- サービスコードの ID と DB の行。予定の API のマイグレーションが持つ。
- 早朝・夜間・深夜の加算の時間帯。照合の判定の規則で、予定の API は使わない。

照合の結果は変えない。

- 別の表記をそろえる処理は、表を引くときと、予定の API がマスタのコードと比べるときにだけ使う。
- 照合の API の予定と実績の対応は、今と同じく、表記をそろえた後の値で比べる。別の表記をそろえて比べる変更は、照合の規則の変更として別に決める。

### シードとの一致の確認

予定の API の `postgres` のテストで、マイグレーションを当てた DB の `service_codes` の全ての行を読み、次の 2 つを確認する。

- `code` の表記をそろえてから `servicecode` で引くと、範囲が見つかる。シードの `code` は半角の数字（`訪看I2`）で、表はそろえた後の全角の数字（`訪看I２`）で引くためである。
- 見つかった範囲が、行の `service_time_range_start` と `service_time_range_end` と同じである。

`servicecode` の表を直してシードを直し忘れると、予定の API のテストが失敗する。  
シードの注釈は、手で合わせる指示から、このテストを指す文に改める。

### 予定の API の servicecode の機能

予定の API のサービスコードを、`visit` から新しい機能のパッケージ `internal/features/servicecode` に移す。訪問の区分は `visit` に残す。

- `servicecode` は、サービスコードの型、リポジトリのインターフェース、一覧の操作を持ち、別の表記をそろえてマスタのコードを引く処理を `packages/go/servicecode` で書く。
- `visit` の `MasterRepository` を、サービスコードと訪問の区分の 2 つのリポジトリに分ける。
- 機能の間の import の順を、`organization`、`staff`、`servicecode`、`patient`、`visit`、`schedule` にする。`schedule` の後の Google カレンダーの機能の順は変えない。
  - `patient` は `servicecode` を import し、`visit` を import しない。
  - `visit` は `patient` を import し、利用者を `patient` の読み取りのインターフェースで受ける。`PatientFinder` と `patient.VisitFinder` をやめる。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** サービスの規則を `packages/go/servicecode` に置き、予定の API はシードと表の一致をテストで確認する。サービスコードを `servicecode` の機能に分ける | 報酬の改定で直す場所が 1 か所になる。シードの直し忘れをテストが止める。`visit` と `patient` の逆向きの関数が無くなる | `packages/go` を変えると、2 つの API の両方で確認する。予定の API の機能のパッケージが 1 つ増える |
| 配置先を変えず、マイグレーションと照合の API の表を比べるテストだけを足す | 移すコードが無い | 予定の API のテストが、照合の API の `internal` を読めない（ADR-0010）。比べるには表を写すことになり、2 か所のままになる。別の表記の吸収も 2 か所のまま残る |
| 照合の API が、予定の API から HTTP でサービスコードと範囲を読む | 正本が予定の API の DB の 1 か所になる | 照合が予定の API の稼働に依存する。2 つの API は呼び合わないとした ADR-0010 の前提に反する。CSV だけの照合にも予定の API が要る |

## Consequences

### Positive

- 報酬の改定で、提供時間の範囲と別の表記を `packages/go/servicecode` の 1 か所で直せる。シードの直し忘れは、予定の API のテストが止める。
- `gcaltitle` が、カレンダーのタイトルの形だけを持つ。
- 予定の API の `visit` が、利用者を `patient` から直接受ける。`cmd/api` が 2 つの機能をつなぐ関数が無くなる。

### Negative

- `packages/go/servicecode` を変えると、照合の API と予定の API の両方のテストを流す。
- 予定の API の `calendar`、`httpapi`、`postgres`、`inmem`、組み立ての場所で、`visit` のサービスコードを使う箇所を `servicecode` に直す。
- 予定の API の機能のパッケージが 1 つ増え、依存の順の規則を直す。
