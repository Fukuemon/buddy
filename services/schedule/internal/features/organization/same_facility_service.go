package organization

import "github.com/Fukuemon/buddy/services/schedule/internal/apperr"

// RequireSameFacility は、参照した ownerFacilityID が facilityID と違うときに入力のエラーを返す。
// label と id は、エラーの文で参照したものを指す。事業所をまたぐ参照を拒む規則である（context/domain/facility.md）。
func RequireSameFacility(label, id, ownerFacilityID, facilityID string) error {
	if ownerFacilityID != facilityID {
		return apperr.Invalid("%s %s はこの事業所に属していません", label, id)
	}
	return nil
}
