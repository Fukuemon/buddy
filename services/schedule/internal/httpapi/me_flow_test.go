package httpapi_test

import (
	"io"
	"log/slog"
	"net/http"
	"reflect"
	"testing"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/access"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/staff"
	"github.com/Fukuemon/buddy/services/schedule/internal/httpapi"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

// TestGetMeReturnsAuthenticatedStaffDetail は、本物の access.Service で認証した職員の詳細を、GET /v1/me が全ての項目で返すことを確認する。
func TestGetMeReturnsAuthenticatedStaffDetail(t *testing.T) {
	s := inmem.NewStore()
	s.Facilities[facilityID] = organization.Facility{ID: facilityID, OrgID: testOrgID}
	s.FacilityByOrg[testOrgID] = facilityID
	sub := "sub-1"
	phone := "090-0000-0000"
	updated := time.Date(2026, 10, 23, 9, 0, 0, 0, time.UTC)
	s.Staff[staffID] = staff.Detail{
		Summary: staff.Summary{
			Staff: staff.Staff{
				ID: staffID, Sub: &sub, Username: "青木 陽菜", Email: "hina.aoki@example.com", PhoneNumber: &phone,
				FacilityID: facilityID, DepartmentID: "DEP", TeamID: "TEAM", PositionID: "POS",
			},
			DepartmentName: "訪問看護", TeamName: "A チーム", PositionName: "マネージャー",
			CreatedAt: updated.Add(-time.Hour), UpdatedAt: updated,
		},
		Policies: []staff.PolicyGrant{{
			UserPolicyID: "UP", PolicyID: "P", PolicyCode: organization.ScheduleTeamEdit, PolicyName: "チームの予定の編集",
			TargetTeamIDs: []string{"TEAM"},
		}},
	}
	auth := access.NewService(access.Deps{Facilities: inmem.Facilities{Store: s}, Staff: inmem.Staff{Store: s}})
	h := httpapi.NewRouter(httpapi.Apps{
		Staff: httpapi.StaffApp{Get: staff.NewGet(inmem.Staff{Store: s}).Do},
		Auth:  auth,
	}, httpapi.RouterConfig{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Verifier: testVerifier})

	got := request(t, h, http.MethodGet, "/v1/me", "", http.StatusOK)
	want := map[string]any{
		"id": staffID, "sub": sub, "username": "青木 陽菜", "email": "hina.aoki@example.com", "phone_number": phone,
		"facility_id": facilityID, "department": map[string]any{"id": "DEP", "name": "訪問看護"},
		"team": map[string]any{"id": "TEAM", "name": "A チーム"}, "position": map[string]any{"id": "POS", "name": "マネージャー"},
		"status": "active", "visits": true, "leave_started_at": nil, "leave_return_date": nil, "retired_at": nil,
		"created_at": "2026-10-23T08:00:00Z", "updated_at": "2026-10-23T09:00:00Z",
		"policies": []any{map[string]any{
			"user_policy_id": "UP", "policy_id": "P", "code": string(organization.ScheduleTeamEdit), "name": "チームの予定の編集",
			"target_user_ids": nil, "target_team_ids": []any{"TEAM"},
		}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("GET /v1/me\n got = %v\nwant = %v", got, want)
	}
}
