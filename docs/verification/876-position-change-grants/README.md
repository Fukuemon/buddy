# #876 役職を変えても職員ごとに足した権限が残ることのエビデンスの一覧

[#876](https://github.com/Fukuemon/buddy/issues/876) の受け入れの条件の、検証のシナリオとエビデンスの spec の対応。  
検証の issue は [#996](https://github.com/Fukuemon/buddy/issues/996) である。

- [検証の設計](test-design.md)
- [検証のシナリオ](scenarios.md)

## 撮るシナリオ

spec は `packages/e2e/tests/evidence/staff/position-change-acceptance.e2e.ts` である。  
検証環境ができるまで、pull request のエビデンスと同じ撮影の config で、ローカル環境の compose で撮る。  
入れる先は `issue-996` である。test の名前は、`name` と次の文を空白でつないだものである。

| シナリオ | `name` | test の名前の `name` の後の文 |
| --- | --- | --- |
| 個別に足した権限は役職を変えても残る | `s1-keep-individual` | 個別に権限を足したメンバーの役職をリーダーに変えた場合、残ることを示す注意が出て、変えた後も個別に足した権限に対象ごと残ること |
| 残った権限が予定の判定に使われ、外すと使われない | `s2-kept-grant-authorizes` | 個別に足した権限を持つメンバーをリーダーに変えた後に日の表示を開いた場合、残った権限で予定が見え、外すと見えなくなること |
| 新しい役職のデフォルトにもある個別の権限は対象が残り、判定もその対象で行う | `s3-overlap-target` | チームの予定の閲覧をチーム B で個別に足したチーム A のメンバーをリーダーに変えた場合、閲覧の対象が B のまま残り、編集はチーム A の予定だけに出ること |
| 個別に足した職員の管理の権限だけを持つ最後の管理者は、その権限の無い役職に変えられる | `s4-last-manager-individual` | 職員の管理を個別に足した唯一の有効な管理者が自分の役職をリーダーに変えた場合、変えられて職員の管理が個別に足した権限に残ること |

- `s4-last-manager-individual` は、シードの唯一の管理者の青木 陽菜を、撮影の間だけリーダーに変える。`portless compose down -v` の後に起動し直してから、`-g 's4-'` で単独で流す。
- 子の pull request で撮ったエビデンス（`packages/e2e/tests/evidence/staff/position.e2e.ts` の 10 本）は撮り直さない。対応は [test-design.md](test-design.md) のケース表にある。

## spec を置かないシナリオ

| 観点 | 確認の方法 |
| --- | --- |
| 役職のデフォルトを変える操作が無く、今あるデータを移していない | 予定の API の `openapi.yaml` の役職の操作は `listPositions`、`createPosition`、`getPosition` だけである。web の `positions` は `list` だけである。[#998](https://github.com/Fukuemon/buddy/pull/998) と [#1014](https://github.com/Fukuemon/buddy/pull/1014) の変更のファイルにマイグレーションが無い |
| 3 方式以上の比較と採否の理由が ADR にある | ADR-0041 の Considered Options に、「役職を変えたときの、職員ごとに足した権限」と「役職のデフォルトを変えるとき」の 4 案ずつの比較がある |
| 実装が要るなら後続の issue に分けてある | [#993](https://github.com/Fukuemon/buddy/issues/993) と [#994](https://github.com/Fukuemon/buddy/issues/994) に分け、どちらも閉じた |

## 撮影のための操作

- 撮る職員は、録画の外（`prepareOutsideRecording`）で、青木 陽菜のトークンで予定の API から登録する。権限を足す操作と役職を変える操作も、録画の外で予定の API から行う。ただし `s1-keep-individual` の権限の追加と役職の変更は、録画の中で画面から行う。
- `s2` から `s4` は、録画の外でブローカーにログインし、cookie を録画のコンテキストに移す（`carryLoginTo`）。
- 予定は、録画の外で、青木 陽菜のトークンで予定の API から明日に作る。
- `s2-kept-grant-authorizes` の権限を外す操作は、録画の途中の出来事が前提なので、字幕で撮影のためと断って、録画の中で予定の API を呼ぶ。
- `s4-last-manager-individual` は、撮った後に `finally` で、撮る職員のトークンで青木 陽菜を管理者に戻し、青木 陽菜のトークンで撮る職員の職員の管理の権限を外す。
