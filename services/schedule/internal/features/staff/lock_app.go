package staff

import "context"

// locked は、トランザクションの中で職員 id の事業所をロックし、ロックの後に読み直した職員を返す。
// 休職、復職、退職、役職とチームを変える操作、権限を外す操作は、このロックで同じ事業所の中で 1 つずつ行う。
func locked(ctx context.Context, staff Repository, id string) (Detail, error) {
	st, err := staff.Get(ctx, id)
	if err != nil {
		return Detail{}, err
	}
	if err := staff.LockFacility(ctx, st.FacilityID); err != nil {
		return Detail{}, err
	}
	return staff.Get(ctx, id)
}
