// Package audit は、権限の変更の監査の記録（ADR-0042）の型と、リクエストの相関 ID を持つ。
// 記録は、権限を変える操作と同じトランザクションで書く。標準ライブラリと kernel にだけ依存する。
package audit

import (
	"cmp"
	"context"
	"errors"
	"log/slog"
	"slices"

	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Action は、記録する操作である。値は ADR-0042 の残す操作の表の action である。
type Action string

// 記録する操作。運営者の操作（FacilityCreate、StaffCreateForced）とマイグレーション（GrantMigrate）は、
// 予定の API の HTTP の操作からは書かない。
const (
	FacilityCreate    Action = "facility.create"
	PositionCreate    Action = "position.create"
	StaffCreate       Action = "staff.create"
	StaffCreateForced Action = "staff.create_forced"
	GrantAdd          Action = "grant.add"
	GrantRemove       Action = "grant.remove"
	PositionChange    Action = "position.change"
	TeamChange        Action = "team.change"
	GrantMigrate      Action = "grant.migrate"
)

// ActorKind は、操作した人の種類である。
type ActorKind string

// 操作した人の種類。マイグレーションは運営者の操作として扱う。
const (
	ActorStaff    ActorKind = "staff"
	ActorOperator ActorKind = "operator"
)

// Record は、監査の記録の 1 行である。ActorKind が ActorStaff なら ActorUserID を、ActorOperator なら ActorOperator を持つ。
// Before と After は JSON にして書き、nil なら持たない。職員と利用者の名前とメールは持たない。時刻は保存するときに決まる。
type Record struct {
	ID               string
	FacilityID       string
	Action           Action
	ActorKind        ActorKind
	ActorUserID      string
	ActorOperator    string
	TargetUserID     string
	TargetPositionID string
	Before           any
	After            any
	RequestID        string
}

// Writer は、監査の記録を書く。呼び出し側は、権限を変える操作と同じトランザクションの中で呼ぶ。
type Writer interface {
	Write(ctx context.Context, r Record) error
}

// Grant は、記録に持つ職員の権限 1 つである。対象は、権限の code に合わせて職員かチームの ID を持つ。
type Grant struct {
	Code          string   `json:"code"`
	TargetUserIDs []string `json:"target_user_ids,omitempty"`
	TargetTeamIDs []string `json:"target_team_ids,omitempty"`
}

// StaffState は、職員を対象にする操作の、変更の前か後の全量である。役職とチームの ID と、権限の並びを持つ。
// 権限は code の順に、対象は ID の順に並べる。
type StaffState struct {
	PositionID string  `json:"position_id"`
	TeamID     string  `json:"team_id"`
	Grants     []Grant `json:"grants"`
}

// NewStaffState は、役職 positionID、チーム teamID、権限 grants の StaffState を、権限を code の順に、対象を ID の順に並べて作る。
// grants の値は書き換えない。
func NewStaffState(positionID, teamID string, grants []Grant) StaffState {
	out := make([]Grant, 0, len(grants))
	for _, g := range grants {
		out = append(out, Grant{Code: g.Code, TargetUserIDs: sorted(g.TargetUserIDs), TargetTeamIDs: sorted(g.TargetTeamIDs)})
	}
	slices.SortFunc(out, func(a, b Grant) int { return cmp.Compare(a.Code, b.Code) })
	return StaffState{PositionID: positionID, TeamID: teamID, Grants: out}
}

// GrantsEqual は、s と o の権限と対象が同じかを返す。役職とチームは比べない。
func (s StaffState) GrantsEqual(o StaffState) bool {
	return slices.EqualFunc(s.Grants, o.Grants, func(a, b Grant) bool {
		return a.Code == b.Code && slices.Equal(a.TargetUserIDs, b.TargetUserIDs) && slices.Equal(a.TargetTeamIDs, b.TargetTeamIDs)
	})
}

// Equal は、s と o の役職、チーム、権限と対象が同じかを返す。
func (s StaffState) Equal(o StaffState) bool {
	return s.PositionID == o.PositionID && s.TeamID == o.TeamID && s.GrantsEqual(o)
}

// PositionState は、役職の作成の、作成の後の全量である。役職の名前と、デフォルトの権限の code を code の順に持つ。
type PositionState struct {
	Name        string   `json:"name"`
	PolicyCodes []string `json:"policy_codes"`
}

// NewPositionState は、名前 name とデフォルトの権限の code の PositionState を、code の順に並べて作る。
func NewPositionState(name string, codes []string) PositionState {
	return PositionState{Name: name, PolicyCodes: sorted(codes)}
}

func sorted(ids []string) []string {
	if len(ids) == 0 {
		return nil
	}
	out := slices.Clone(ids)
	slices.Sort(out)
	return out
}

// Entry は、職員の操作の記録のうち、操作ごとに決まる値である。
type Entry struct {
	FacilityID       string
	Action           Action
	TargetUserID     string
	TargetPositionID string
	Before           any
	After            any
}

// Recorder は、リクエストを送った職員の操作の記録を書く。
type Recorder struct {
	w    Writer
	ids  kernel.IDGenerator
	self func(ctx context.Context) (string, bool)
}

// NewRecorder は Recorder を作る。self は、ctx のリクエストを送った職員の ID を返す。
func NewRecorder(w Writer, ids kernel.IDGenerator, self func(ctx context.Context) (string, bool)) Recorder {
	return Recorder{w: w, ids: ids, self: self}
}

// ErrNoActor は、ctx にリクエストを送った職員がいないので、記録を書けないことを表す。
var ErrNoActor = errors.New("監査の記録の操作した職員がいません")

// ErrNoRequestID は、ctx に相関 ID がないので、記録を書けないことを表す。
var ErrNoRequestID = errors.New("監査の記録の相関 ID がありません")

// ByStaff は、ctx のリクエストを送った職員が e の操作をした記録を、ctx の相関 ID で書く。
// 職員か相関 ID が ctx にないときは書かずに ErrNoActor か ErrNoRequestID を返し、呼び出し側のトランザクションを戻させる。
func (r Recorder) ByStaff(ctx context.Context, e Entry) error {
	actor, ok := r.self(ctx)
	if !ok || actor == "" {
		return ErrNoActor
	}
	rid := RequestID(ctx)
	if rid == "" {
		return ErrNoRequestID
	}
	return r.w.Write(ctx, Record{
		ID: r.ids.NewID(), FacilityID: e.FacilityID, Action: e.Action,
		ActorKind: ActorStaff, ActorUserID: actor,
		TargetUserID: e.TargetUserID, TargetPositionID: e.TargetPositionID,
		Before: e.Before, After: e.After, RequestID: rid,
	})
}

type requestIDKey struct{}

// WithRequestID は、相関 ID id を持つ ctx を返す。
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, id)
}

// RequestID は、ctx の相関 ID を返す。無ければ空を返す。
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey{}).(string)
	return id
}

// LogHandler は、ctx に相関 ID があれば、ログの行に request_id として足す slog.Handler で h を包む。
// 監査の記録とログを同じ値でつなぐためである。
func LogHandler(h slog.Handler) slog.Handler { return logHandler{h} }

type logHandler struct{ slog.Handler }

func (h logHandler) Handle(ctx context.Context, r slog.Record) error {
	if id := RequestID(ctx); id != "" {
		r.AddAttrs(slog.String("request_id", id))
	}
	return h.Handler.Handle(ctx, r)
}

func (h logHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return logHandler{h.Handler.WithAttrs(attrs)}
}

func (h logHandler) WithGroup(name string) slog.Handler { return logHandler{h.Handler.WithGroup(name)} }
