package staff

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/civil"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
	"github.com/Fukuemon/buddy/services/schedule/internal/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/tx"
)

// Deps は、Usecase が使うリポジトリと、事業所の中の組織を読む小さなインターフェイスである。
type Deps struct {
	Facilities  kernel.Finder[organization.Facility]
	Departments kernel.Finder[organization.Department]
	Teams       kernel.Finder[organization.Team]
	Positions   kernel.Finder[organization.Position]
	Policies    kernel.Finder[organization.Policy]
	Staff       Repository
	Identities  Identities
	Assignments AssignmentReader
	Calendars   CalendarDetacher
	// Self は、ctx のリクエストを送った職員の ID を返す。職員が自分を休職か退職にする操作を拒むのに使う。nil なら拒まない。
	Self func(ctx context.Context) (string, bool)
	// Now は、休職と退職で残る予定を数え始める日を決める時刻である。nil なら time.Now を使う。
	Now func() time.Time
}

// Usecase は、職員の操作である。職員の登録、休職、復職、退職と、職員の権限と役職を変える操作は、guard が許すときだけ行う（ADR-0006）。
// 職員の登録、休職、復職、退職は、ブローカーの職員も書く（ADR-0017、ADR-0018）。
type Usecase struct {
	deps  Deps
	tx    tx.Transactor
	ids   kernel.IDGenerator
	guard organization.Guard
}

// NewUsecase は Usecase を作る。
func NewUsecase(deps Deps, tx tx.Transactor, ids kernel.IDGenerator, guard organization.Guard) *Usecase {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	return &Usecase{deps: deps, tx: tx, ids: ids, guard: guard}
}

// CreateInput は、職員の作成の入力である。
type CreateInput struct {
	FacilityID   string
	Username     string
	Email        string
	PhoneNumber  *string
	DepartmentID string
	TeamID       string
	PositionID   string
}

// Create は、職員を作り、役職のデフォルトの権限を与える。チームを対象にする権限は、職員の所属のチームを対象にする。事業所が見つからないときは apperr.ErrNotFound を、
// 部署、チーム、役職が見つからないか別の事業所のものであるときは入力のエラーを、職員の管理の権限が無いときは apperr.ErrForbidden を、
// 同じ事業所に同じメールの職員がいるか、同じメールの職員がブローカーで止められているか、ほかの事業所にいるときは
// apperr.ErrConflict を返す。ほかの事業所にいることは、文で示さない。
//
// 入力を確認してから、ブローカーに職員を登録の途中の状態で登録させ、返った職員の ID を Sub にして書き、書けたらブローカーの
// 職員を有効にする。登録の途中の職員はログインできないので、ここで書けなかった職員はブローカーに残ってもログインできない。
// ブローカーの登録は同じメールで送り直しても 1 人にまとまるので、失敗した登録は送り直してよい。ここで書けず、ブローカーの職員を
// この呼び出しで作っていて、その ID の職員がまだいなければ、ブローカーの職員を消して戻す。
// 前の登録が書いた後に有効にできなかったときは、送り直すと、書いた職員を有効にしてから返す。
func (s *Usecase) Create(ctx context.Context, in CreateInput) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	f, err := s.deps.Facilities.Get(ctx, in.FacilityID)
	if err != nil {
		return Detail{}, err
	}
	dep, err := s.deps.Departments.Get(ctx, in.DepartmentID)
	if err != nil {
		return Detail{}, apperr.Reference("部署", in.DepartmentID, err)
	}
	if err := apperr.SameFacility("部署", dep.ID, dep.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	team, err := s.deps.Teams.Get(ctx, in.TeamID)
	if err != nil {
		return Detail{}, apperr.Reference("チーム", in.TeamID, err)
	}
	if err := apperr.SameFacility("チーム", team.ID, team.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	pos, err := s.deps.Positions.Get(ctx, in.PositionID)
	if err != nil {
		return Detail{}, apperr.Reference("役職", in.PositionID, err)
	}
	if err := apperr.SameFacility("役職", pos.ID, pos.FacilityID, in.FacilityID); err != nil {
		return Detail{}, err
	}
	st, err := New(NewParams{
		ID:           s.ids.NewID(),
		Username:     in.Username,
		Email:        in.Email,
		PhoneNumber:  in.PhoneNumber,
		FacilityID:   in.FacilityID,
		DepartmentID: dep.ID,
		TeamID:       team.ID,
		PositionID:   pos.ID,
	})
	if err != nil {
		return Detail{}, err
	}
	if f.OrgID == "" {
		return Detail{}, apperr.Invalid("事業所 %s は認証の組織に結び付いていないので、職員を登録できません", f.ID)
	}
	reg, err := s.deps.Identities.Register(ctx, f.OrgID, st.Email)
	switch {
	case errors.Is(err, ErrEmailTaken):
		return Detail{}, apperr.Conflict("メール %s の職員は登録できません", st.Email)
	case errors.Is(err, ErrIdentitySuspended):
		return Detail{}, apperr.Conflict("メール %s の職員は休職しています", st.Email)
	case err != nil:
		return Detail{}, err
	}
	st.Sub = &reg.ID
	grants := DefaultGrants(pos, team.ID, s.ids)
	var created Detail
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.deps.Staff.Create(ctx, st, grants); err != nil {
			return apperr.AsConflict(err, "メール %s の職員はこの事業所にすでにいます", st.Email)
		}
		created, err = s.deps.Staff.Get(ctx, st.ID)
		return err
	})
	if err != nil && reg.Created {
		return Detail{}, errors.Join(err, s.unregister(context.WithoutCancel(ctx), reg.ID))
	}
	if errors.Is(err, apperr.ErrConflict) && reg.Pending {
		created, err = s.written(ctx, reg.ID, err)
	}
	if err != nil {
		return Detail{}, err
	}
	if err := s.deps.Identities.Activate(context.WithoutCancel(ctx), reg.ID); err != nil {
		return Detail{}, fmt.Errorf("職員を書きましたが、ブローカーの職員 %s を有効にできません。同じ本文で送り直してください: %w", reg.ID, err)
	}
	return created, nil
}

// written は、前の登録がブローカーの職員 sub で職員を書き、有効にできずに終わっていれば、書いた職員を返す。
// 書いた職員がいなければ、書けなかったエラー err を返す。
func (s *Usecase) written(ctx context.Context, sub string, err error) (Detail, error) {
	id, ferr := s.deps.Staff.FindIDBySub(ctx, sub)
	if errors.Is(ferr, apperr.ErrNotFound) {
		return Detail{}, err
	}
	if ferr != nil {
		return Detail{}, ferr
	}
	return s.deps.Staff.Get(ctx, id)
}

// unregister は、予定の API に書けなかった登録のブローカーの職員 sub を消す。同じメールの登録を同時に受け、
// ほかの登録が同じ sub で職員を書いていれば、消さない。ブローカーは登録の途中の職員だけを消すので、ほかの登録が
// 有効にした職員は残る。
func (s *Usecase) unregister(ctx context.Context, sub string) error {
	if _, err := s.deps.Staff.FindIDBySub(ctx, sub); !errors.Is(err, apperr.ErrNotFound) {
		return err
	}
	if err := s.deps.Identities.Unregister(ctx, sub); err != nil {
		return fmt.Errorf("ブローカーの職員 %s を消せません: %w", sub, err)
	}
	return nil
}

// LeaveInput は、職員を休職にする入力である。ReturnDate は戻る予定の日のメモで、nil なら持たない。
type LeaveInput struct {
	ReturnDate *civil.Date
}

// StatusChange は、休職か退職にした職員と、その日以降に残る予定と担当の利用者である。
type StatusChange struct {
	Staff       Detail
	Assignments Assignments
}

// Leave は、職員を休職にし、休職にした職員と、その日以降に残る予定と担当の利用者を返す。残る予定があっても拒まない。
// 休職の職員を休職にし直すと、戻る予定の日だけを書き換える。職員が見つからないときは apperr.ErrNotFound を、
// 職員の管理の権限が無いときは apperr.ErrForbidden を、自分か、事業所で職員の管理の権限を持つ最後の有効な職員か、
// 退職した職員を休職にしようとしたときは apperr.ErrConflict を返す。
//
// 事業所をロックしたトランザクションの中で、ブローカーの職員を先に止めてから、ここで休職を書く。ここで書けなければ、
// ブローカーで止めたままロールバックするので、送り直すとブローカーの停止をやり直してから書く。止めたままの間も、職員はログインできない。
// ブローカーが止めた後に Hydra の取り消しに失敗したときも、ここで休職を書いてからエラーを返し、送り直しで取り消しをやり直させる。
// ブローカーの職員の ID が無いか、ブローカーにいない職員はログインできないので、ここでだけ休職にする。
func (s *Usecase) Leave(ctx context.Context, id string, in LeaveInput) (StatusChange, error) {
	var out StatusChange
	var revokeErr error
	err := s.stop(ctx, id, func(ctx context.Context, cur Detail) error {
		if cur.Status() == StatusRetired {
			return apperr.Conflict("退職した職員は休職にできません")
		}
		a, err := s.deps.Assignments.From(ctx, cur.FacilityID, cur.ID, civil.Today(s.deps.Now()))
		if err != nil {
			return err
		}
		if cur.Sub != nil {
			switch err := s.deps.Identities.Suspend(ctx, *cur.Sub); {
			case errors.Is(err, apperr.ErrNotFound):
				// ブローカーにいない職員はログインできないので、ここでだけ休職にする
			case errors.Is(err, ErrIdentityRetired):
				return apperr.Conflict("職員はブローカーで退職しています。退職をやり直してください")
			case errors.Is(err, ErrRevokeFailed):
				revokeErr = err
			case err != nil:
				return err
			}
		}
		if err := s.deps.Staff.StartLeave(ctx, cur.ID, in.ReturnDate); err != nil {
			return err
		}
		out.Assignments = a
		out.Staff, err = s.deps.Staff.Get(ctx, cur.ID)
		return err
	})
	if err != nil {
		return StatusChange{}, err
	}
	if revokeErr != nil {
		return StatusChange{}, fmt.Errorf("職員を休職にしましたが、ログインの取り消しに失敗しました。もう一度休職にしてください: %w", revokeErr)
	}
	return out, nil
}

// Retire は、職員を退職にし、名前、所属、役職を残してメールと電話番号を消し、職員の外部のカレンダーを外す。
// カレンダーのレコードと予定の対応は残す。その日以降の予定、繰り返しの予定、担当の利用者が
// 残れば、書かずに残る一覧を持つ *AssignedError を返す。退職した職員を退職にしても成功する。職員が見つからないときは
// apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、自分か、事業所で職員の管理の権限を持つ
// 最後の有効な職員を退職にしようとしたときは apperr.ErrConflict を返す。
//
// 2 か所の書き込みは Leave と同じく、事業所をロックしたトランザクションの中で、ブローカーの職員を先に退職にしてからここで書く。
// ブローカーは退職でメールと上流のアカウントを消すので、ここで書けずにロールバックしても、職員はログインできない。送り直すと書く。
func (s *Usecase) Retire(ctx context.Context, id string) (StatusChange, error) {
	var out StatusChange
	var revokeErr error
	err := s.stop(ctx, id, func(ctx context.Context, cur Detail) error {
		a, err := s.deps.Assignments.From(ctx, cur.FacilityID, cur.ID, civil.Today(s.deps.Now()))
		if err != nil {
			return err
		}
		if !a.Empty() {
			return &AssignedError{Assignments: a}
		}
		if cur.Sub != nil {
			switch err := s.deps.Identities.Retire(ctx, *cur.Sub); {
			case errors.Is(err, apperr.ErrNotFound):
				// ブローカーにいない職員はログインできないので、ここでだけ退職にする
			case errors.Is(err, ErrRevokeFailed):
				revokeErr = err
			case err != nil:
				return err
			}
		}
		if err := s.deps.Staff.Retire(ctx, cur.ID); err != nil {
			return err
		}
		if err := s.deps.Calendars.DetachByStaff(ctx, cur.ID); err != nil {
			return err
		}
		out.Staff, err = s.deps.Staff.Get(ctx, cur.ID)
		return err
	})
	if err != nil {
		return StatusChange{}, err
	}
	if revokeErr != nil {
		return StatusChange{}, fmt.Errorf("職員を退職にしましたが、ログインの取り消しに失敗しました。もう一度退職にしてください: %w", revokeErr)
	}
	return out, nil
}

// stop は、休職と退職に共通の確認をしてから、事業所をロックしたトランザクションの中で、読み直した職員で write を呼ぶ。
// 自分と、事業所で職員の管理の権限を持つ最後の有効な職員は、apperr.ErrConflict で拒む。
// 事業所のロックで、同じ事業所の休職と退職を 1 つずつにし、管理者どうしが同時に休職にし合って有効な管理者がいなくなるのを防ぐ。
func (s *Usecase) stop(ctx context.Context, id string, write func(ctx context.Context, cur Detail) error) error {
	if err := s.guard(ctx); err != nil {
		return err
	}
	if s.deps.Self != nil {
		if self, ok := s.deps.Self(ctx); ok && self == id {
			return apperr.Conflict("自分を休職か退職にすることはできません")
		}
	}
	return s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.locked(ctx, id)
		if err != nil {
			return err
		}
		if err := s.lastManager(ctx, cur); err != nil {
			return err
		}
		return write(ctx, cur)
	})
}

// locked は、トランザクションの中で職員 id の事業所をロックし、ロックの後に読み直した職員を返す。
// 休職、復職、退職は、このロックで同じ事業所の中で 1 つずつ行う。
func (s *Usecase) locked(ctx context.Context, id string) (Detail, error) {
	ref, err := s.deps.Staff.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := s.deps.Staff.LockFacility(ctx, ref.FacilityID); err != nil {
		return Detail{}, err
	}
	return s.deps.Staff.Get(ctx, id)
}

// lastManager は、cur が事業所で職員の管理の権限を持つ最後の有効な職員なら apperr.ErrConflict を返す。
// 戻す操作をする職員がいなくなると、DB を直すほかに戻せないためである（ADR-0018）。
func (s *Usecase) lastManager(ctx context.Context, cur Detail) error {
	if cur.Status() != StatusActive || !slices.ContainsFunc(cur.Policies, func(g PolicyGrant) bool {
		return g.PolicyCode == organization.StaffManage
	}) {
		return nil
	}
	managers, err := s.deps.Staff.ActiveManagers(ctx, cur.FacilityID)
	if err != nil {
		return err
	}
	if !slices.ContainsFunc(managers, func(m string) bool { return m != cur.ID }) {
		return apperr.Conflict("職員の管理の権限を持つ最後の有効な職員は、休職と退職にできません")
	}
	return nil
}

// Reinstate は、休職の職員を有効に戻し（復職）、戻した職員を返す。有効な職員を戻しても成功する。職員が見つからないときは
// apperr.ErrNotFound を、職員の管理の権限が無いときは apperr.ErrForbidden を、退職した職員を戻そうとしたときは apperr.ErrConflict を返す。
//
// 休職と逆に、ここで休職を外してコミットしてから、ブローカーの職員を有効に戻す。ログインできるようにする書き込みを最後にし、
// 片方だけが書けたときに、ログインできる職員が予定の API で休職のまま残らないようにする。
// ブローカーを呼ぶ 2 つ目のトランザクションは、事業所をロックして職員を読み直し、有効なままのときだけ呼ぶ。
// 1 つ目のコミットの後に休職にし直されていれば、ブローカーの職員を戻さない。ブローカーが戻したときは 2 つ目でここに書かないので、
// ブローカーが戻した後にコミットに失敗しても、状態は食い違わない。
// ブローカーが退職か、止めていない職員と答えたときは、外した休職を書き戻して apperr.ErrConflict を返す。
// ブローカーに届かなかったときは、外した休職を残してエラーを返す。その間、職員はブローカーで止めたままなのでログインできない。
// 送り直すと、ブローカーの職員を戻し直す。
func (s *Usecase) Reinstate(ctx context.Context, id string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var before Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		before, err = s.locked(ctx, id)
		if err != nil {
			return err
		}
		if before.Status() == StatusRetired {
			return apperr.Conflict("退職した職員は復職できません")
		}
		return s.deps.Staff.EndLeave(ctx, before.ID)
	})
	if err != nil {
		return Detail{}, err
	}
	var brokerErr error
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.locked(ctx, id)
		if err != nil {
			return err
		}
		if cur.Status() != StatusActive {
			return apperr.Conflict("復職の途中に、職員がほかの操作で休職か退職になりました")
		}
		if cur.Sub == nil {
			return nil
		}
		switch err := s.deps.Identities.Resume(ctx, *cur.Sub); {
		case err == nil, errors.Is(err, apperr.ErrNotFound):
			// ブローカーにいない職員はログインできないので、ここでだけ戻す
		case errors.Is(err, ErrIdentityRetired):
			brokerErr = apperr.Conflict("職員はブローカーで退職しています。退職をやり直してください")
		case errors.Is(err, apperr.ErrConflict):
			brokerErr = apperr.Conflict("ブローカーの職員は休職していないので、復職できません")
		default:
			return fmt.Errorf("休職を外しましたが、ブローカーの職員を戻せませんでした。もう一度復職にしてください: %w", err)
		}
		if brokerErr != nil && before.Status() == StatusOnLeave {
			return s.deps.Staff.StartLeave(ctx, cur.ID, before.LeaveReturnDate)
		}
		return nil
	})
	if err != nil {
		return Detail{}, err
	}
	if brokerErr != nil {
		return Detail{}, brokerErr
	}
	return s.deps.Staff.Get(ctx, id)
}

// ChangePosition は、職員の役職を positionID にし、職員の権限を新しい役職のデフォルトの権限からコピーし直す。
// ADR-0002 のとおり、職員ごとに足した権限と対象は消える。職員が見つからないときは apperr.ErrNotFound を、
// 役職が見つからないか別の事業所のものであるときは入力のエラーを返す。
func (s *Usecase) ChangePosition(ctx context.Context, id, positionID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.deps.Staff.Get(ctx, id)
		if err != nil {
			return err
		}
		pos, err := s.deps.Positions.Get(ctx, positionID)
		if err != nil {
			return apperr.Reference("役職", positionID, err)
		}
		if err := apperr.SameFacility("役職", pos.ID, pos.FacilityID, cur.FacilityID); err != nil {
			return err
		}
		if err := s.deps.Staff.ChangePosition(ctx, cur.ID, pos.ID, DefaultGrants(pos, cur.TeamID, s.ids)); err != nil {
			return err
		}
		changed, err = s.deps.Staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}

// GrantInput は、職員に足す権限と対象である。対象は、権限の code に合わせて職員かチームを指定する。
type GrantInput struct {
	PolicyID      string
	TargetUserIDs []string
	TargetTeamIDs []string
}

// AddGrant は、職員に権限を 1 つ足す。対象を指定する権限には、職員を対象にする権限なら職員を、
// チームを対象にする権限ならチームを 1 つ以上指定する。対象を指定しない権限には、対象を指定できない。
// 職員が見つからないときは apperr.ErrNotFound を、権限、対象が合わないか別の事業所のものであるときは入力のエラーを、
// 同じ権限が既にあるときは apperr.ErrConflict を返す。
func (s *Usecase) AddGrant(ctx context.Context, id string, in GrantInput) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		cur, err := s.deps.Staff.Get(ctx, id)
		if err != nil {
			return err
		}
		p, err := s.deps.Policies.Get(ctx, in.PolicyID)
		if err != nil {
			return apperr.Reference("権限", in.PolicyID, err)
		}
		g := Grant{ID: s.ids.NewID(), PolicyID: p.ID}
		g.Targets, err = s.targets(ctx, p, cur.FacilityID, in)
		if err != nil {
			return err
		}
		if err := s.deps.Staff.AddGrant(ctx, cur.ID, g); err != nil {
			return apperr.AsConflict(err, "職員はすでに権限 %s を持っています", p.Name)
		}
		changed, err = s.deps.Staff.Get(ctx, cur.ID)
		return err
	})
	return changed, err
}

// targets は、権限 p の対象を確認し、同じ事業所 facilityID の職員かチームの対象を作る。
func (s *Usecase) targets(ctx context.Context, p organization.Policy, facilityID string, in GrantInput) ([]Target, error) {
	users, teams := in.TargetUserIDs, in.TargetTeamIDs
	switch {
	case !p.NeedsTarget:
		if len(users) > 0 || len(teams) > 0 {
			return nil, apperr.Invalid("権限 %s は対象を指定できません", p.ID)
		}
		return nil, nil
	case p.Code.TargetsTeam():
		if len(teams) == 0 || len(users) > 0 {
			return nil, apperr.Invalid("権限 %s にはチームの対象だけを 1 つ以上指定します", p.ID)
		}
	default:
		if len(users) == 0 || len(teams) > 0 {
			return nil, apperr.Invalid("権限 %s には職員の対象だけを 1 つ以上指定します", p.ID)
		}
	}
	out := make([]Target, 0, len(users)+len(teams))
	seen := make(map[string]bool, cap(out))
	for _, uid := range users {
		st, err := s.deps.Staff.Get(ctx, uid)
		if err != nil {
			return nil, apperr.Reference("職員", uid, err)
		}
		if err := apperr.SameFacility("職員", st.ID, st.FacilityID, facilityID); err != nil {
			return nil, err
		}
		if seen[uid] {
			return nil, apperr.Invalid("職員 %s が重なっています", uid)
		}
		seen[uid] = true
		out = append(out, Target{ID: s.ids.NewID(), UserID: st.ID})
	}
	for _, tid := range teams {
		t, err := s.deps.Teams.Get(ctx, tid)
		if err != nil {
			return nil, apperr.Reference("チーム", tid, err)
		}
		if err := apperr.SameFacility("チーム", t.ID, t.FacilityID, facilityID); err != nil {
			return nil, err
		}
		if seen[tid] {
			return nil, apperr.Invalid("チーム %s が重なっています", tid)
		}
		seen[tid] = true
		out = append(out, Target{ID: s.ids.NewID(), TeamID: t.ID})
	}
	return out, nil
}

// RemoveGrant は、職員の権限 userPolicyID と、その対象を外す。
// 職員か、職員のその権限が見つからないときは apperr.ErrNotFound を返す。
func (s *Usecase) RemoveGrant(ctx context.Context, id, userPolicyID string) (Detail, error) {
	if err := s.guard(ctx); err != nil {
		return Detail{}, err
	}
	var changed Detail
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.deps.Staff.RemoveGrant(ctx, id, userPolicyID); err != nil {
			return err
		}
		var err error
		changed, err = s.deps.Staff.Get(ctx, id)
		return err
	})
	return changed, err
}

// Get は、職員と権限を返す。
func (s *Usecase) Get(ctx context.Context, id string) (Detail, error) {
	return s.deps.Staff.Get(ctx, id)
}

// List は、事業所の職員を返す。事業所が見つからないときは apperr.ErrNotFound を返す。
func (s *Usecase) List(ctx context.Context, facilityID string, q ListQuery) ([]Summary, error) {
	if _, err := s.deps.Facilities.Get(ctx, facilityID); err != nil {
		return nil, err
	}
	return s.deps.Staff.ListByFacility(ctx, facilityID, q)
}
