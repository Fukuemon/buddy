package organization

import (
	"context"
	"time"

	"github.com/Fukuemon/buddy/services/schedule/internal/apperr"
	"github.com/Fukuemon/buddy/services/schedule/internal/kernel"
)

// Team は、事業所のチームである。
type Team struct {
	ID         string
	FacilityID string
	Name       string
	Color      TeamColor
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// TeamColor は、チームの色である。値は packages/ui のチームの色のトークンの名前（team- の後ろ）で、事業所の中で重なってよい。
type TeamColor string

// チームの色の 8 色である。
const (
	TeamColorBlue    TeamColor = "blue"
	TeamColorOrange  TeamColor = "orange"
	TeamColorMagenta TeamColor = "magenta"
	TeamColorCyan    TeamColor = "cyan"
	TeamColorYellow  TeamColor = "yellow"
	TeamColorPurple  TeamColor = "purple"
	TeamColorGreen   TeamColor = "green"
	TeamColorLime    TeamColor = "lime"
)

// TeamColors は、チームの色の 8 色を、色を省いて作ったチームに選ぶ順に返す。
func TeamColors() []TeamColor {
	return []TeamColor{
		TeamColorBlue, TeamColorOrange, TeamColorMagenta, TeamColorCyan,
		TeamColorYellow, TeamColorPurple, TeamColorGreen, TeamColorLime,
	}
}

// ParseTeamColor は、s がチームの色の 8 色のどれかなら TeamColor を返し、どれでもなければ入力のエラーを返す。
func ParseTeamColor(s string) (TeamColor, error) {
	for _, c := range TeamColors() {
		if string(c) == s {
			return c, nil
		}
	}
	return "", apperr.Invalid("チームの色 %q は選べる色にありません", s)
}

// NextTeamColor は、事業所のチームが使っている色 usedColors から、新しいチームの色を選ぶ。
// 使っているチームが最も少ない色を、同じ数なら TeamColors の順の先の色を返す。8 色が使われていなければ、使われていない色の先頭になる。
func NextTeamColor(usedColors []TeamColor) TeamColor {
	counts := make(map[TeamColor]int, len(usedColors))
	for _, c := range usedColors {
		counts[c]++
	}
	colors := TeamColors()
	next := colors[0]
	for _, c := range colors[1:] {
		if counts[c] < counts[next] {
			next = c
		}
	}
	return next
}

// NewTeam は、名前と色を検証して Team を作る。
func NewTeam(id, facilityID, name string, color TeamColor) (Team, error) {
	if err := kernel.ValidateText("チームの名前", name, maxNameLen); err != nil {
		return Team{}, err
	}
	if _, err := ParseTeamColor(string(color)); err != nil {
		return Team{}, err
	}
	return Team{ID: id, FacilityID: facilityID, Name: name, Color: color}, nil
}

// TeamRepository は、チームを読み書きする。見つからないときは apperr.ErrNotFound を、
// 同じ事業所に同じ名前があるときは apperr.ErrConflict を返す。Update は、チーム t.ID の名前と色を t の値にする。
type TeamRepository interface {
	Get(ctx context.Context, id string) (Team, error)
	ListByFacility(ctx context.Context, facilityID string) ([]Team, error)
	Create(ctx context.Context, t Team) error
	Update(ctx context.Context, t Team) error
}
