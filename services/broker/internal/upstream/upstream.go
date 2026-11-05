// Package upstream は、事業所ごとの上流の IdP の設定を読む（ADR-0013）。
// 組織の ID、issuer、client ID の対応はインフラが設定のファイルで渡し、client secret はシークレットのファイルで渡す。
package upstream

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
)

// IdP は、1 つの事業所の上流の IdP である。
type IdP struct {
	// OrgID は、事業所の組織の ID である。access token の org_id と、職員の所属の事業所に使う。
	OrgID string
	// Issuer は、上流の IdP の issuer の URL である。discovery の文書をここから読み、ID token の iss と比べる。
	Issuer string
	// ClientID と ClientSecret は、ブローカーを上流の IdP の RP として登録したときの値である。
	ClientID     string
	ClientSecret string
}

// IdPs は、組織の ID から上流の IdP を引く。
type IdPs map[string]IdP

// Of は、組織 orgID の上流の IdP を返す。設定が無ければ false を返す。
func (s IdPs) Of(orgID string) (IdP, bool) {
	idp, ok := s[orgID]
	return idp, ok && orgID != ""
}

type entry struct {
	OrgID    string `json:"org_id"`
	Issuer   string `json:"issuer"`
	ClientID string `json:"client_id"`
}

// Load は、上流の IdP の設定のファイル idpsPath と、client secret のファイル secretsPath を読む。
//
// idpsPath の形は [{"org_id": "...", "issuer": "...", "client_id": "..."}]、secretsPath の形は {"<org_id>": "<client secret>"} である。
// 次のいずれかではエラーを返し、ブローカーは起動しない。
//   - ファイルを読めないか、JSON の形が違うか、知らないキーがある
//   - 上流の IdP の一覧が空である
//   - org_id、issuer、client_id のいずれかが空である
//   - issuer が http か https の URL でない
//   - org_id が重なっている
//   - 上流の IdP の client secret が無いか空である、または上流の IdP の設定に無い組織の client secret がある
//
// エラーの文には、client secret の値を出さない。
func Load(idpsPath, secretsPath string) (IdPs, error) {
	var entries []entry
	if err := decode(idpsPath, &entries); err != nil {
		return nil, fmt.Errorf("上流の IdP の設定 %s を読めない: %w", idpsPath, err)
	}
	if len(entries) == 0 {
		return nil, fmt.Errorf("上流の IdP の設定 %s が空である", idpsPath)
	}
	var secrets map[string]string
	if err := decode(secretsPath, &secrets); err != nil {
		// 構文のエラーの文は、ファイルの文字を引くことがあるので、元のエラーを包まない
		return nil, fmt.Errorf("上流の IdP の client secret のファイル %s を読めない", secretsPath)
	}
	out := make(IdPs, len(entries))
	for i, e := range entries {
		org, issuer, clientID := strings.TrimSpace(e.OrgID), strings.TrimSpace(e.Issuer), strings.TrimSpace(e.ClientID)
		switch {
		case org == "":
			return nil, fmt.Errorf("上流の IdP の設定 %s の %d 件目の org_id が空である", idpsPath, i+1)
		case issuer == "":
			return nil, fmt.Errorf("上流の IdP の設定 %s の org_id %s の issuer が空である", idpsPath, org)
		case !isHTTPURL(issuer):
			return nil, fmt.Errorf("上流の IdP の設定 %s の org_id %s の issuer %q は http か https の URL にする", idpsPath, org, issuer)
		case clientID == "":
			return nil, fmt.Errorf("上流の IdP の設定 %s の org_id %s の client_id が空である", idpsPath, org)
		}
		if _, ok := out[org]; ok {
			return nil, fmt.Errorf("上流の IdP の設定 %s の org_id %s が重なっている", idpsPath, org)
		}
		secret := secrets[org]
		if secret == "" {
			return nil, fmt.Errorf("上流の IdP の client secret のファイル %s に org_id %s の値が無い", secretsPath, org)
		}
		out[org] = IdP{OrgID: org, Issuer: issuer, ClientID: clientID, ClientSecret: secret}
	}
	for org := range secrets {
		if _, ok := out[org]; !ok {
			return nil, fmt.Errorf("上流の IdP の client secret のファイル %s の org_id %s が、上流の IdP の設定 %s に無い", secretsPath, org, idpsPath)
		}
	}
	return out, nil
}

// decode は、path の JSON を v に読む。知らないキーと、JSON の後に続く値を拒む。
func decode(path string, v any) error {
	f, err := os.Open(path) //nolint:gosec // G304: 運営側が環境変数で渡す設定のファイルを読む
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	dec := json.NewDecoder(f)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return err
	}
	if dec.More() {
		return fmt.Errorf("JSON の値の後に余分な値がある")
	}
	return nil
}

func isHTTPURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != ""
}
