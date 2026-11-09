// Package gcaltitle は、Google カレンダーの予定のタイトルを、`【サービス内容】利用者名` の形で読み書きする。
// 照合の API と予定の API が同じ規則で訪問の予定を見分けるために共有する。
package gcaltitle

import (
	"errors"
	"regexp"
	"strings"
	"unicode"
)

// GAS の splitTitle の正規表現 /【(.*?)】\s*(.*)/ を移植した。
// JavaScript の \s は全角スペースを含むので、Unicode の空白に広げた。
var titlePattern = regexp.MustCompile(`【(.*?)】[\s\p{Zs}]*(.*)`)

// IsVisitTitle は、タイトルが `【` と `】` の両方を含むかを返す。順序は問わない。
// 含む予定だけを訪問の予定として扱う。
func IsVisitTitle(title string) bool {
	return strings.Contains(title, "【") && strings.Contains(title, "】")
}

// ParseTitle は、`【サービス内容】利用者名` の形のタイトルを分ける。
// 最初の `【…】` の中をサービス内容に、`】` の後の空白を飛ばした残り全部を利用者名にする。
// 利用者名の後ろの文字（2 つ目の `【…】` など）は利用者名に残す。
// `【…】` の組がないタイトルと、サービス内容か利用者名が空のタイトルでは、エラーを返す。
func ParseTitle(title string) (service, client string, err error) {
	m := titlePattern.FindStringSubmatch(title)
	if m == nil {
		return "", "", errors.New("タイトルに `【…】` の組がない")
	}
	service, client = m[1], m[2]
	if strings.TrimFunc(service, unicode.IsSpace) == "" {
		return "", "", errors.New("タイトルのサービス内容が空である")
	}
	if strings.TrimFunc(client, unicode.IsSpace) == "" {
		return "", "", errors.New("タイトルの利用者名が空である")
	}
	return service, client, nil
}

// Format は、訪問の予定のタイトルを `【サービス内容】利用者名` の形で作る。ParseTitle で読むと、service と client に戻る。
func Format(service, client string) string {
	return "【" + service + "】" + client
}

// NormalizeClient は、利用者名の全角と半角のスペースを除く。照合の API が予定と実績を比べるときと、予定の API が利用者を引くときに使う。
func NormalizeClient(s string) string {
	return strings.NewReplacer("　", "", " ", "").Replace(s)
}
