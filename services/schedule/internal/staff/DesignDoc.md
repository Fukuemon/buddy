---
type: feature-design
title: 職員の管理
description: 予定の API での職員の登録、休職、復職、退職の手順と、休職と退職の前の残る一覧、職員の管理の画面の読み込みと権限の保存、職員の管理で返す 409 のエラー
status: stable
governs: services/schedule/internal/staff
verified_commit: 4e53ca5
---

# 職員の管理

## Overview

予定の API は、事業所の職員を登録し、休職、復職、退職にする。  
職員の身元はブローカーが持つので、どの操作もブローカーと予定の API の 2 か所に書く。  
この文書は予定の API の側の手順を書き、休職と退職の規則のような業務の規則は [職員とログイン](https://github.com/Fukuemon/buddy/blob/develop/context/domain/staff-login.md) が持つ。  
予定の API の全体の設計は [予定の管理の Design Doc](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md) に、全体の中での責務と依存は [buddy Design Doc](https://github.com/Fukuemon/buddy/blob/develop/docs/design/DesignDoc.md) にある。

## Scope

持つもの

- 職員の登録、休職、復職、退職の手順
- 休職と退職を確定する前の残る一覧
- 職員の管理の画面が職員と選択肢を読む時点と、権限の保存の送り方

持たないもの

- 休職と退職の規則。[職員とログイン](https://github.com/Fukuemon/buddy/blob/develop/context/domain/staff-login.md) が持つ
- 職員ごとの権限の足し外し。[権限の Design Doc](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/internal/access/DesignDoc.md) にある
- 休職と退職の職員と、訪問しない職員への予定の割り振りを拒む仕組み。[予定の管理の Design Doc の休職と退職の職員と、訪問しない職員への割り振り](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#休職と退職の職員と訪問しない職員への割り振り) にある
- ブローカーの側の書き込み。[ID ブローカーの Design Doc の職員の登録、休職、復職、退職](https://github.com/Fukuemon/buddy/blob/develop/services/broker/DesignDoc.md#職員の登録休職復職退職) にある

## Design

### 職員の登録、休職、復職、退職

職員の登録は `POST /v1/facilities/{facility_id}/users` で行う。  
休職、復職、退職は、`POST /v1/users/{user_id}/` の下の `leave`、`reinstate`、`retire` で行う。  
どれも、`staff.Usecase` が職員の管理の権限を確認してから行う。  
休職と退職の規則は [職員とログイン](https://github.com/Fukuemon/buddy/blob/develop/context/domain/staff-login.md) にある。

- 登録は、次の順に行う。
  1. 入力と部署、チーム、役職を確認する。
  2. 事業所の組織の ID とメールで、ブローカーに登録の途中の職員を登録させる。事業所に組織の ID が無ければ、ブローカーを呼ばずに 400 を返す。
  3. 返った職員の ID を `users.sub` に入れて書く。
  4. 書けたら、ブローカーの職員を有効にする。
- 同じメールの職員がブローカーで休職していれば、409 を返す。
- ほかの事業所に同じメールの職員がいれば、事業所を示さない 409（「メール … の職員は登録できません」）を返す。
- ブローカーが入力を 400 で拒めば、ブローカーの文を付けて 400 を返す。
- 予定の API に書けなかったときは、この呼び出しでブローカーの職員を作っていて、その ID の職員がまだいなければ、ブローカーの職員を消して戻す。
- 休職と退職を確定する前の残る一覧は、`GET /v1/users/{user_id}/remaining_assignments` で返し、何も書かない。
  - 一覧は、休職と退職と同じ `staff.Usecase` の関数で作り、同じ規則の一覧を同じ形（`StaffAssignments`）で返す。
- 休職と退職は、`staff.Usecase` が事業所の行をロックしたトランザクションの中で、職員を読み直してから行う。
  - 自分と、事業所で職員の管理の権限を持つ最後の有効な職員は、409 で拒む。
- 休職、退職、復職の呼び出しの順と、2 か所の書き込みの片方だけが残ったときの扱いは、[ID ブローカーの Design Doc の職員の登録、休職、復職、退職](https://github.com/Fukuemon/buddy/blob/develop/services/broker/DesignDoc.md#職員の登録休職復職退職) の図と文にある。
- ADR-0017: [職員の身元をブローカーが持ち、権限と業務のデータは予定の API が持つ](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0017-identity-boundary.md)
- ADR-0018: [職員の停止を、戻せる休職と、戻せない退職に分ける](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0018-staff-leave-and-retirement.md)

### 職員の管理の画面の読み込みと保存

職員の一覧、職員の登録、職員の詳細の画面は、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを、ルートの context の `Viewer.canManageStaff` で判定する。  
持たなければ、職員の API を呼ばずに `PageForbiddenMessage` を出す。  
職員の登録は何も出さず、下の職員の一覧が権限の無いことを示す。  
この判定は表示のためだけで、変える操作は予定の API が [予定の認可](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/internal/access/DesignDoc.md#予定の認可) で拒む。

画面とダイアログごとの、読む時点、読むもの、読む理由は次のとおり。

| 画面 | 読む時点 | 読むもの | 読む理由 |
| --- | --- | --- | --- |
| 職員の一覧（`StaffListContainer`） | - | 休職と退職を含む事業所の全ての職員（`listUsers`） | - |
| 職員の一覧（`StaffListContainer`） | - | チーム、役職、部署（`listTeams`、`listPositions`、`listDepartments`） | 絞り込みの選択肢 |
| 職員の登録（`StaffCreateDialogContainer`） | 開いたとき | 部署、チーム、役職 | - |
| 職員の詳細（`StaffDetailContainer`） | 開いたとき | 職員（`getUser`） | - |
| 職員の詳細（`StaffDetailContainer`） | 開いたとき | 役職（`listPositions`） | 職員の役職に決まっている権限で、権限を役職のまとまりと個別に足したまとまりに分ける |
| 職員の詳細（`StaffDetailContainer`） | 開いたとき | 権限（`listPolicies`） | 権限の名前と並び |
| 職員の詳細（`StaffDetailContainer`） | 開いたとき | 事業所の職員とチーム（`listUsers`、`listTeams`） | 権限の対象の名前を引く |
| 職員の詳細（`StaffDetailContainer`） | プロフィールの編集のダイアログを開いたとき | 部署（`listDepartments`） | - |
| 職員の詳細（`StaffDetailContainer`） | 休職と退職のダイアログを開いたとき | 残る予定と担当の利用者（`getUserRemainingAssignments`） | - |

職員の一覧の名前の検索、チーム、役職、部署、状態の絞り込みと並び順は、読んだ職員を `filterStaff` が画面で決める。  
絞り込むたびに API を呼ばない。  
`listUsers` に状態の絞り込みと名前の一部での検索が無いためである。

職員の登録は、部署、チーム、役職のどれかを読めなければ、選択の欄を押せなくし、登録の失敗の文の位置に読めなかったことの文を出す。

職員の詳細が、開いたときに役職、権限、事業所の職員とチームを読むのは、権限の一覧を出すためである。

- 権限の保存（`useSavePolicies`）は、開いたときの権限と比べて変更を作り、1 つずつ送る。
  - チェックを入れた権限は `addUserPolicy` で足し、外した権限は `removeUserPolicy` で外す。対象を変えた権限は、外してから新しい対象で足し直す。
  - 最初の変更が API に届かなければ、何も変えていないので、例外を投げてダイアログに保存の失敗の文を出す。
  - 2 つ目からの失敗は、変えられた分を戻さず、変えられなかった変更と理由を返す。
  - 終わったら、成否によらず職員の詳細と一覧を読み直す。
  - 権限をまとめて置き換える API が無いので、一部だけが変わることがある。

## Interface

- パスの定義の正本は [予定の API の openapi.yaml](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/openapi.yaml) である。
- エラーの JSON の形と、ほかのエラーのコードは [予定の管理の Design Doc の Interface](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#interface) にある。
- 職員の管理は、次の 409 を返す。
  - 409 の `conflict`（職員）: 同じメールの職員がブローカーで休職しているかほかの事業所にいる、自分か最後の有効な管理者を休職か退職にする、退職した職員を休職か復職にするか、名前、電話番号、部署、チームを変える
    - 最後の有効な管理者から `staff.manage` を外すか、`staff.manage` を持たない役職に変えたときも返す
  - 409 の `staff_has_assignments`: 退職にする職員に、その日以降の予定、繰り返しの予定、担当の利用者が残る。本文の `assignments` に残る一覧を持つ
