package inmem

import (
	"context"
	"fmt"
	"strconv"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
)

// Identity は、Identities が持つブローカーの職員である。Pending は登録の途中で、Activate で外れる。
// Suspended は休職で、Resume で外れる。Retired は退職で、メールを消す。
type Identity struct {
	OrgID     string
	Email     string
	Pending   bool
	Suspended bool
	Retired   bool
}

// Identities は、staff.Identities のメモリ上の実装で、ブローカーの職員を ID ごとに持つ。ID は "broker-1" から順に振る。
type Identities struct {
	Members map[string]Identity
	// Err は、Register、Suspend、Retire が返すエラーである。nil なら成功する。
	Err error
	// ActivateErr は、Activate が返すエラーである。nil なら成功する。
	ActivateErr error
	// ResumeErr は、Resume が返すエラーである。nil なら成功する。
	ResumeErr error
	// RevokeErr は、Suspend と Retire が職員を書いた後に返すエラーで、Hydra の取り消しの失敗を表す。nil なら成功する。
	RevokeErr error
	seq       int
}

// NewIdentities は、ブローカーの職員がいない Identities を作る。
func NewIdentities() *Identities { return &Identities{Members: map[string]Identity{}} }

// Register は、同じメールの職員がいなければ、新しい ID の登録の途中の職員を作る。同じ組織にいればその職員を返す。
// 止めた職員なら staff.ErrIdentitySuspended を、ほかの組織にいれば staff.ErrEmailTaken を返す。
func (s *Identities) Register(_ context.Context, orgID, email string) (staff.Registration, error) {
	if s.Err != nil {
		return staff.Registration{}, s.Err
	}
	for id, m := range s.Members {
		switch {
		case m.Email != email:
			continue
		case m.OrgID != orgID:
			return staff.Registration{}, staff.ErrEmailTaken
		case m.Suspended:
			return staff.Registration{}, staff.ErrIdentitySuspended
		}
		return staff.Registration{ID: id, Pending: m.Pending}, nil
	}
	s.seq++
	id := "broker-" + strconv.Itoa(s.seq)
	s.Members[id] = Identity{OrgID: orgID, Email: email, Pending: true}
	return staff.Registration{ID: id, Created: true, Pending: true}, nil
}

// Activate は、職員の登録の途中を外す。いなければ apperr.ErrNotFound を、止めた職員なら staff.ErrIdentitySuspended を返す。
func (s *Identities) Activate(_ context.Context, id string) error {
	if s.ActivateErr != nil {
		return s.ActivateErr
	}
	m, ok := s.Members[id]
	switch {
	case !ok:
		return apperr.ErrNotFound
	case m.Suspended:
		return staff.ErrIdentitySuspended
	}
	m.Pending = false
	s.Members[id] = m
	return nil
}

// Unregister は、登録の途中の職員を消す。いないか、登録の途中でなければ何もしない。
func (s *Identities) Unregister(_ context.Context, id string) error {
	if m, ok := s.Members[id]; ok && m.Pending {
		delete(s.Members, id)
	}
	return nil
}

// Suspend は、職員を止める。RevokeErr があれば、止めてから RevokeErr を staff.ErrRevokeFailed で包んで返す。
// いなければ apperr.ErrNotFound を返す。
func (s *Identities) Suspend(_ context.Context, id string) error {
	if s.Err != nil {
		return s.Err
	}
	m, ok := s.Members[id]
	switch {
	case !ok:
		return apperr.ErrNotFound
	case m.Retired:
		return staff.ErrIdentityRetired
	}
	m.Suspended = true
	s.Members[id] = m
	return s.revoked()
}

// Resume は、職員の休職を外す。ResumeErr があれば、何もせずに返す。いなければ apperr.ErrNotFound を、
// 退職した職員なら staff.ErrIdentityRetired を、登録の途中の職員なら apperr.ErrConflict を返す。
func (s *Identities) Resume(_ context.Context, id string) error {
	if s.ResumeErr != nil {
		return s.ResumeErr
	}
	m, ok := s.Members[id]
	switch {
	case !ok:
		return apperr.ErrNotFound
	case m.Retired:
		return staff.ErrIdentityRetired
	case m.Pending:
		return apperr.ErrConflict
	}
	m.Suspended = false
	s.Members[id] = m
	return nil
}

// Retire は、職員を退職にし、メールを消す。RevokeErr があれば、退職にしてから RevokeErr を staff.ErrRevokeFailed で包んで返す。
// いなければ apperr.ErrNotFound を返す。
func (s *Identities) Retire(_ context.Context, id string) error {
	if s.Err != nil {
		return s.Err
	}
	m, ok := s.Members[id]
	if !ok {
		return apperr.ErrNotFound
	}
	m.Retired, m.Suspended, m.Email = true, false, ""
	s.Members[id] = m
	return s.revoked()
}

func (s *Identities) revoked() error {
	if s.RevokeErr != nil {
		return fmt.Errorf("%w: %w", staff.ErrRevokeFailed, s.RevokeErr)
	}
	return nil
}
