// Package gcal は、Google カレンダーの予定を照合の予定として読む。
package gcal

import (
	"errors"
	"regexp"
	"strings"
	"unicode"
)

// GAS の splitTitle の正規表現 /【(.*?)】\s*(.*)/ を写した。
// JavaScript の \s は全角スペースを含むので、Unicode の空白に広げた。
var titlePattern = regexp.MustCompile(`【(.*?)】[\s\p{Zs}]*(.*)`)

// IsVisitTitle は、題名が `【` と `】` の両方を含むかを返す。順序は問わない。
// 含む予定だけを訪問の予定として扱う。
func IsVisitTitle(title string) bool {
	return strings.Contains(title, "【") && strings.Contains(title, "】")
}

// ParseTitle は、`【サービス内容】利用者名` の形の題名を分ける。
// 最初の `【…】` の中をサービス内容に、`】` の後の空白を飛ばした残り全部を利用者名にする。
// 利用者名の後ろの文字（2 つ目の `【…】` など）は利用者名に残す。
// `【…】` の組がない題名と、サービス内容か利用者名が空の題名では、エラーを返す。
func ParseTitle(title string) (service, client string, err error) {
	m := titlePattern.FindStringSubmatch(title)
	if m == nil {
		return "", "", errors.New("題名に `【…】` の組がない")
	}
	service, client = m[1], m[2]
	if strings.TrimFunc(service, unicode.IsSpace) == "" {
		return "", "", errors.New("題名のサービス内容が空である")
	}
	if strings.TrimFunc(client, unicode.IsSpace) == "" {
		return "", "", errors.New("題名の利用者名が空である")
	}
	return service, client, nil
}
