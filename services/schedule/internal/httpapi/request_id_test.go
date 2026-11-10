package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
	"github.com/Fukuemon/buddy/services/schedule/internal/principal"
	"github.com/Fukuemon/buddy/services/schedule/internal/ulid"
)

// TestRequestIDLinksAuditAndLog は、予定の API がリクエストごとに相関 ID を振り、権限の変更の監査の記録と、リクエストのログに
// 同じ値を書くことを確認する（ADR-0042、#992 の完了の条件）。クライアントが送った相関 ID のヘッダーは使わない。
func TestRequestIDLinksAuditAndLog(t *testing.T) {
	const policyID = "01M5E1S42TTS7QZK05YGS0GYR8"
	s := inmem.NewStore()
	s.Facilities[facilityID] = organization.Facility{ID: facilityID}
	s.Staff[staffID] = staff.Detail{Summary: staff.Summary{Staff: staff.Staff{ID: staffID, FacilityID: facilityID}}}
	s.Policies[policyID] = organization.Policy{ID: policyID, Code: organization.ScheduleSelfEdit}
	rec := audit.NewRecorder(inmem.PermissionAudits{Store: s}, &inmem.SeqIDs{}, func(ctx context.Context) (string, bool) {
		p, ok := principal.From(ctx)
		return p.Staff.ID, ok
	})
	addGrant := staff.NewAddGrant(inmem.Staff{Store: s}, inmem.Facilities{Store: s}, inmem.Policies{Store: s}, inmem.Teams{Store: s}, rec, &inmem.Tx{}, &inmem.SeqIDs{},
		func(context.Context) error { return nil })
	var logs bytes.Buffer
	h := httpapi.NewRouter(httpapi.Apps{Auth: fakeAuth{}, Staff: httpapi.StaffApp{AddGrant: addGrant.Do}}, httpapi.RouterConfig{
		Logger: slog.New(audit.LogHandler(slog.NewJSONHandler(&logs, nil))), Verifier: testVerifier,
	})

	send := func() {
		t.Helper()
		req := httptest.NewRequest(http.MethodPost, "/v1/users/"+staffID+"/policies", strings.NewReader(`{"policy_id":"`+policyID+`"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token(t, testOrgID))
		req.Header.Set("X-Request-Id", "from-client")
		if res := serve(h, req); res.Code != http.StatusCreated {
			t.Fatalf("status = %d, body = %s", res.Code, res.Body)
		}
	}
	send()
	if len(s.PermissionAudits) != 1 {
		t.Fatalf("記録 = %+v, want 1 行", s.PermissionAudits)
	}
	r := s.PermissionAudits[0]
	if !ulid.IsValid(r.RequestID) || r.ActorKind != audit.ActorStaff || r.ActorUserID != staffID {
		t.Errorf("記録 = %+v, want 振った ULID の相関 ID と、リクエストを送った職員", r)
	}
	var line struct {
		Msg       string `json:"msg"`
		RequestID string `json:"request_id"`
	}
	if err := json.Unmarshal(logs.Bytes(), &line); err != nil {
		t.Fatalf("ログ %s: %v", logs.String(), err)
	}
	if line.Msg != "request" || line.RequestID != r.RequestID {
		t.Errorf("ログ = %s, want 記録と同じ相関 ID %s", logs.String(), r.RequestID)
	}

	// 足した権限を外して同じリクエストを送り直し、相関 ID がリクエストごとに違うことを確認する
	s.Grants[staffID] = nil
	send()
	if len(s.PermissionAudits) != 2 || s.PermissionAudits[1].RequestID == r.RequestID {
		t.Errorf("記録 = %+v, want リクエストごとに別の相関 ID", s.PermissionAudits)
	}
}
