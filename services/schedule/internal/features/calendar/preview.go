package calendar

import "context"

// Preview は、カレンダー id の期間 rng の予定を読み、取り込むとどうなるかを返す。予定は書かない。
// 職員が休職か訪問しない職員なら、新しい予定を SkipStaffOnLeave か SkipStaffNonVisiting の取り込まない予定にする。
// カレンダーが無いか外したとき、職員が退職したときは apperr.ErrNotFound を、読めないときは ErrUnreadable か ErrUnavailable か ErrNotConfigured を返す。
func (u *Usecase) Preview(ctx context.Context, id string, rng Range) (Preview, error) {
	if err := u.guard(ctx); err != nil {
		return Preview{}, err
	}
	c, err := u.active(ctx, id)
	if err != nil {
		return Preview{}, err
	}
	src, err := u.source(ctx, c.FacilityID)
	if err != nil {
		return Preview{}, err
	}
	blocked, err := u.staffBlocked(ctx, c)
	if err != nil {
		return Preview{}, err
	}
	p, _, err := u.plan(ctx, src, c, rng, blocked)
	if err != nil {
		return Preview{}, err
	}
	return Preview{Range: rng, Counts: p.counts, NeedsReview: p.review, Skipped: p.skipped}, nil
}
