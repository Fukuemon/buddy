package organization_test

import (
	"errors"
	"testing"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/features/organization"
)

// TestRequireSourceModeTransition は、正本のモードを google_primary から buddy_primary にだけ移せることを確認する（ADR-0029）。
func TestRequireSourceModeTransition(t *testing.T) {
	google, buddy := organization.SourceGooglePrimary, organization.SourceBuddyPrimary
	for _, tt := range []struct {
		from, to organization.SourceMode
		ok       bool
	}{
		{google, buddy, true},
		{buddy, google, false},
		{buddy, buddy, false},
		{google, google, false},
	} {
		err := organization.RequireSourceModeTransition(tt.from, tt.to)
		if tt.ok != (err == nil) {
			t.Errorf("%s から %s: err = %v", tt.from, tt.to, err)
		}
		var ce *apperr.ConflictError
		if err != nil && (!errors.As(err, &ce) || ce.Code != organization.CodeSourceModeTransition) {
			t.Errorf("%s から %s: err = %v, want code %s", tt.from, tt.to, err, organization.CodeSourceModeTransition)
		}
	}
}
