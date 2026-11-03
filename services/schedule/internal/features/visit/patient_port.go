package visit

import "context"

// PatientFinder は、ID が id の利用者を探して返す。利用者が見つからないときは apperr.ErrNotFound を返す。
// patient が visit に依存するので、visit は patient を import せずに関数で受け取る。
type PatientFinder func(ctx context.Context, id string) (PatientRef, error)
