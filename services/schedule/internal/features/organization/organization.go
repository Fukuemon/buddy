// Package organization は、事業所と、その中の部署、チーム、役職、権限と、それらの操作を持つ。
package organization

import "context"

const maxNameLen = 255

// Guard は、ctx の職員が職員の管理（StaffManage）を許されているかを確認し、許されないときは apperr.ErrForbidden を返す。
// principal が organization と staff に依存するので、機能のパッケージは principal の判定を import せずに受け取る（ADR-0006）。
type Guard func(ctx context.Context) error
