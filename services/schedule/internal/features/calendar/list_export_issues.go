package calendar

import "context"

// ListExportIssues は、事業所の確認が必要な書き出し（外部のカレンダーで変わっていたか、書けなかった予定）を返す。
func (u *App) ListExportIssues(ctx context.Context, facilityID string) ([]ExportIssue, error) {
	if err := u.guard(ctx); err != nil {
		return nil, err
	}
	return u.deps.Exports.ListIssues(ctx, facilityID)
}
