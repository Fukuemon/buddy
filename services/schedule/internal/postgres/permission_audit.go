package postgres

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/postgres/sqlcgen"
)

// PermissionAuditRepository は、audit.Writer を実装する。
type PermissionAuditRepository struct{ conn }

// NewPermissionAuditRepository は PermissionAuditRepository を作る。
func NewPermissionAuditRepository(pool *pgxpool.Pool) *PermissionAuditRepository {
	return &PermissionAuditRepository{conn{pool}}
}

// Create は、監査の記録 a を 1 行書く。制約の違反は記録を組み立てた側の誤りなので、入力のエラーにせず、そのまま返す。権限を変える操作と同じトランザクションに加わるよう、呼び出し側がトランザクションの中で呼ぶ。
func (r *PermissionAuditRepository) Create(ctx context.Context, a audit.Record) error {
	before, err := toJSON(a.Before)
	if err != nil {
		return err
	}
	after, err := toJSON(a.After)
	if err != nil {
		return err
	}
	err = r.q(ctx).CreatePermissionAudit(ctx, sqlcgen.CreatePermissionAuditParams{
		ID: a.ID, FacilityID: a.FacilityID, Action: string(a.Action), ActorKind: string(a.ActorKind),
		ActorUserID: optional(a.ActorUserID), ActorOperator: optional(a.ActorOperator),
		TargetUserID: optional(a.TargetUserID), TargetPositionID: optional(a.TargetPositionID),
		Before: before, After: after, RequestID: a.RequestID,
	})
	if err != nil {
		return fmt.Errorf("create permission audit: %w", err)
	}
	return nil
}

// toJSON は、v を JSON にする。nil なら NULL として書く nil を返す。
func toJSON(v any) ([]byte, error) {
	if v == nil {
		return nil, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("marshal permission audit: %w", err)
	}
	return b, nil
}
