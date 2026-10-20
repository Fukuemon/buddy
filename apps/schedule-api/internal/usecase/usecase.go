// Package usecase は、API の操作ごとの手順を持つ。domain のインターフェイスにだけ依存する。
package usecase

import (
	"errors"

	"github.com/Fukuemon/buddy/apps/schedule-api/internal/domain"
)

// reference は、リクエストの本文が指す ID が見つからない err を、入力の誤りに置き換える。
// パスで指したリソースと違い、本文の ID が見つからないことは 404 ではなく 400 で返す。
func reference(label, id string, err error) error {
	if errors.Is(err, domain.ErrNotFound) {
		return domain.Invalid("%s %s が見つかりません", label, id)
	}
	return err
}

// sameFacility は、参照した ownerFacilityID が facilityID と違うときに入力の誤りを返す。
func sameFacility(label, id, ownerFacilityID, facilityID string) error {
	if ownerFacilityID != facilityID {
		return domain.Invalid("%s %s はこの事業所に属していません", label, id)
	}
	return nil
}
