---
type: feature-design
title: 職員の管理
description: 予定の API での職員の登録、休職、復職、退職の手順と、休職と退職の前の残る一覧、職員の管理で返す 409 のエラー
status: stable
governs: services/schedule/internal/staff
verified_commit: 4e53ca5
---

# 職員の管理

## Overview

予定の API は、事業所の職員を登録し、休職、復職、退職にする。職員の身元はブローカーが持つので、どの操作もブローカーと予定の API の 2 か所に書く。  
この文書は予定の API の側の手順を書き、休職と退職の規則のような業務の規則は [職員とログイン](https://github.com/Fukuemon/buddy/blob/develop/context/domain/staff-login.md) が持つ。  
予定の API の全体の設計は [予定の管理の Design Doc](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md) に、全体の中での責務と依存は [buddy Design Doc](https://github.com/Fukuemon/buddy/blob/develop/docs/design/DesignDoc.md) にある。

## Scope

持つもの

- 職員の登録、休職、復職、退職の手順
- 休職と退職を確定する前の残る一覧

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
- 同じメールの職員がブローカーで休職していれば、409 を返す。ほかの事業所に同じメールの職員がいれば、事業所を示さない 409（「メール … の職員は登録できません」）を返す。
- ブローカーが入力を 400 で拒めば、ブローカーの文を付けて 400 を返す。
- 予定の API に書けなかったときは、この呼び出しでブローカーの職員を作っていて、その ID の職員がまだいなければ、ブローカーの職員を消して戻す。
- 休職と退職を確定する前の残る一覧は、`GET /v1/users/{user_id}/remaining_assignments` で返す。何も書かない。
  - 一覧は、休職と退職と同じ `staff.Usecase` の関数で作り、同じ規則の一覧を同じ形（`StaffAssignments`）で返す。
- 休職と退職は、`staff.Usecase` が事業所の行をロックしたトランザクションの中で、職員を読み直してから行う。
  - 自分と、事業所で職員の管理の権限を持つ最後の有効な職員は、409 で拒む。
  - 休職は一覧を `assignments` に入れて 200 を返す。退職は一覧が空でなければ、書かずに 409（`staff_has_assignments`）で一覧を返す。
  - ブローカーの職員を先に休職か退職にしてから、`users` を書く。ブローカーで書けなければ、予定の API にも書かない。休職と退職にし直しても成功する。
  - ブローカーが書いた後に Hydra の取り消しに失敗したときは、`users` を書いてから 500 を返す。送り直すと取り消しをやり直す。
  - ブローカーにいない職員は、予定の API でだけ休職か退職にする。
- 退職は、同じトランザクションで、職員の外していない Google カレンダーを外す。
- 復職は、事業所をロックしたトランザクションで `users` の休職を外してコミットしてから、ブローカーの職員を戻す。退職した職員は 409 で拒む。
  - ブローカーは、事業所をロックし直した 2 つ目のトランザクションで、職員が有効なままのときだけ呼ぶ。
- 2 か所の書き込みの順と、片方だけが残ったときの扱いは、[ID ブローカーの Design Doc の職員の登録、休職、復職、退職](https://github.com/Fukuemon/buddy/blob/develop/services/broker/DesignDoc.md#職員の登録休職復職退職) にある。
- ADR-0017: [職員の身元をブローカーが持ち、権限と業務のデータは予定の API が持つ](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0017-identity-boundary.md)
- ADR-0018: [職員の停止を、戻せる休職と、戻せない退職に分ける](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0018-staff-leave-and-retirement.md)

## Interface

- パスの定義の正本は [予定の API の openapi.yaml](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/openapi.yaml) である。エラーの JSON の形と、ほかのエラーのコードは [予定の管理の Design Doc の Interface](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#interface) にある。
- 職員の管理は、次の 409 を返す。
  - 409 の `conflict`（職員）: 同じメールの職員がブローカーで休職しているかほかの事業所にいる、自分か最後の有効な管理者を休職か退職にする、退職した職員を休職か復職にするか、名前、電話番号、部署、チームを変える
    - 最後の有効な管理者から `staff.manage` を外すか、`staff.manage` を持たない役職に変えたときも返す
  - 409 の `staff_has_assignments`: 退職にする職員に、その日以降の予定、繰り返しの予定、担当の利用者が残る。本文の `assignments` に残る一覧を持つ
