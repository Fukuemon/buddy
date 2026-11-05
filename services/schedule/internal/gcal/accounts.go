package gcal

import (
	"context"
	"errors"

	calendarv3 "google.golang.org/api/calendar/v3"

	"github.com/Fukuemon/buddy/packages/go/gcalauth"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/calendar"
)

// OrgOf は、事業所 facilityID の、ID ブローカーの組織の ID を返す。結び付けていなければ空を返す。
type OrgOf func(ctx context.Context, facilityID string) (string, error)

// Clients は、組織のサービスアカウントで Calendar API を呼ぶ calendarv3.Service を返す。実装は gcalauth.Clients である。
type Clients interface {
	Account(orgID string) (string, error)
	Service(orgID string) (*calendarv3.Service, error)
}

// Accounts は、事業所の組織のサービスアカウントで Google Calendar API を呼ぶ calendar.Accounts である（ADR-0011）。
// 事業所は、呼ぶ側がリクエストの職員か結び付けたカレンダーの行から決める。
type Accounts struct {
	clients Clients
	orgOf   OrgOf
}

// NewAccounts は、orgOf で事業所の組織を引き、clients でその組織のサービスアカウントを使う Accounts を返す。
func NewAccounts(clients Clients, orgOf OrgOf) *Accounts {
	return &Accounts{clients: clients, orgOf: orgOf}
}

// ServiceAccount は、事業所 facilityID のサービスアカウントのメールアドレスを返す。
// 事業所が無いか、組織に結び付いていないか、組織にサービスアカウントの対応が無いときは calendar.ErrNotConfigured を返す。
func (a *Accounts) ServiceAccount(ctx context.Context, facilityID string) (string, error) {
	org, err := a.org(ctx, facilityID)
	if err != nil {
		return "", err
	}
	email, err := a.clients.Account(org)
	return email, notConfigured(err)
}

// Source は、事業所 facilityID のサービスアカウントで予定を読む Reader を返す。エラーは ServiceAccount と同じである。
func (a *Accounts) Source(ctx context.Context, facilityID string) (calendar.EventSource, error) {
	svc, err := a.service(ctx, facilityID)
	if err != nil {
		return nil, err
	}
	return NewReader(svc), nil
}

// Writer は、事業所 facilityID のサービスアカウントで予定を書く Writer を返す。エラーは ServiceAccount と同じである。
func (a *Accounts) Writer(ctx context.Context, facilityID string) (calendar.EventWriter, error) {
	svc, err := a.service(ctx, facilityID)
	if err != nil {
		return nil, err
	}
	return NewWriter(svc), nil
}

func (a *Accounts) service(ctx context.Context, facilityID string) (*calendarv3.Service, error) {
	org, err := a.org(ctx, facilityID)
	if err != nil {
		return nil, err
	}
	svc, err := a.clients.Service(org)
	return svc, notConfigured(err)
}

func (a *Accounts) org(ctx context.Context, facilityID string) (string, error) {
	org, err := a.orgOf(ctx, facilityID)
	if errors.Is(err, apperr.ErrNotFound) || (err == nil && org == "") {
		return "", calendar.ErrNotConfigured
	}
	return org, err
}

func notConfigured(err error) error {
	if errors.Is(err, gcalauth.ErrNoAccount) {
		return calendar.ErrNotConfigured
	}
	return err
}
