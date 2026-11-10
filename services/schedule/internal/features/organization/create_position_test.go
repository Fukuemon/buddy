package organization_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/audit"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
	"github.com/Fukuemon/buddy/services/schedule/internal/inmem"
)

func TestOrganizationCreatePosition(t *testing.T) {
	s := inmem.Seeded()
	s.Policies["P1"] = organization.Policy{ID: "P1", Code: organization.ScheduleSelfEdit}
	createPosition := organization.NewCreatePosition(inmem.Facilities{Store: s}, inmem.Policies{Store: s}, inmem.Positions{Store: s}, recorder(s), &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	ctx := audit.WithRequestID(context.Background(), "REQUEST-1")
	if _, err := createPosition.Do(ctx, facilityID, "リーダー", []string{"P1", "MISSING"}); !errors.Is(err, apperr.ErrInvalidInput) {
		t.Fatalf("err = %v, want ErrInvalidInput", err)
	}
	got, err := createPosition.Do(ctx, facilityID, "リーダー", []string{"P1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Policies) != 1 {
		t.Errorf("Policies = %+v", got.Policies)
	}
	// 失敗した作成は記録しない。作った役職の名前とデフォルトの権限の code だけが残る（ADR-0042）。
	want := []audit.Record{{
		ID: "NEW00000000000000000000001", FacilityID: facilityID, Action: audit.PositionCreate, ActorKind: audit.ActorStaff, ActorUserID: "ACTOR",
		TargetPositionID: got.ID, After: audit.NewPositionState("リーダー", []string{"schedule.self.edit"}), RequestID: "REQUEST-1",
	}}
	if !reflect.DeepEqual(s.PermissionAudits, want) {
		t.Errorf("記録 = %+v, want %+v", s.PermissionAudits, want)
	}
	if _, err := createPosition.Do(ctx, facilityID, "リーダー", nil); !errors.Is(err, apperr.ErrConflict) ||
		err.Error() != "役職 リーダー はこの事業所にすでにあります" {
		t.Errorf("同じ名前: err = %v, want 名前の重なりの ErrConflict", err)
	}
	if len(s.PermissionAudits) != 1 {
		t.Errorf("409 の後の記録 = %d 行, want 1 行のまま", len(s.PermissionAudits))
	}
}

// TestOrganizationCreatePositionForbidden は、職員の管理を許されない職員が役職を作れないことを確認する。
// 役職のデフォルトの権限に職員の管理の権限を入れて、ほかの職員に配れないようにするためである（ADR-0007）。
func TestOrganizationCreatePositionForbidden(t *testing.T) {
	s := inmem.Seeded()
	createPosition := organization.NewCreatePosition(inmem.Facilities{Store: s}, inmem.Policies{Store: s}, inmem.Positions{Store: s}, recorder(s), &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return apperr.ErrForbidden })
	if _, err := createPosition.Do(context.Background(), facilityID, "主任", nil); !errors.Is(err, apperr.ErrForbidden) {
		t.Fatalf("err = %v, want ErrForbidden", err)
	}
	if len(s.Positions) != 0 {
		t.Errorf("拒んだのに役職が増えた: %d", len(s.Positions))
	}
}

// TestOrganizationCreatePositionAuditFails は、監査の記録を書けないときに役職も作らないことを確認する。
// inmem.Tx は書いたものを戻さないので、ここではエラーが返ることを確認する。役職が DB に残らないことは postgres のテストが確認する。
func TestOrganizationCreatePositionAuditFails(t *testing.T) {
	s := inmem.Seeded()
	failing := audit.NewRecorder(inmem.PermissionAudits{Store: s, Err: errors.New("書けない")}, &inmem.SeqIDs{}, func(context.Context) (string, bool) { return "ACTOR", true })
	createPosition := organization.NewCreatePosition(inmem.Facilities{Store: s}, inmem.Policies{Store: s}, inmem.Positions{Store: s}, failing, &inmem.Tx{}, &inmem.SeqIDs{}, func(context.Context) error { return nil })
	if _, err := createPosition.Do(audit.WithRequestID(context.Background(), "REQUEST-1"), facilityID, "主任", nil); err == nil {
		t.Fatal("記録を書けないのに成功した")
	}
}

// recorder は、リクエストを送った職員を ACTOR にし、s に記録を書く audit.Recorder である。
func recorder(s *inmem.Store) audit.Recorder {
	return audit.NewRecorder(inmem.PermissionAudits{Store: s}, &inmem.SeqIDs{}, func(context.Context) (string, bool) { return "ACTOR", true })
}
