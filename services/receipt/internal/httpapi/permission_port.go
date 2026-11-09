package httpapi

import "context"

// PermissionChecker は、トークンの職員が照合の権限を持つかを確認する。
// 持たないときは permission.ErrForbidden を、確認できないときはほかのエラーを返す。
type PermissionChecker interface {
	RequireReceiptCheck(ctx context.Context, token string) error
}
