package upstream_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

func write(t *testing.T, name, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

const (
	validIdPs    = `[{"org_id": "org-a", "issuer": "https://accounts.example.com", "client_id": "client-a"}, {"org_id": "org-b", "issuer": "http://idp:8080/office-b", "client_id": "client-b"}]`
	validSecrets = `{"org-a": "secret-a", "org-b": "secret-b"}`
)

func TestLoad(t *testing.T) {
	idps, err := upstream.Load(write(t, "idps.json", validIdPs), write(t, "secrets.json", validSecrets))
	if err != nil {
		t.Fatal(err)
	}
	if len(idps) != 2 {
		t.Fatalf("len = %d, want 2", len(idps))
	}
	got, ok := idps.Of("org-a")
	if want := (upstream.IdP{OrgID: "org-a", Issuer: "https://accounts.example.com", ClientID: "client-a", ClientSecret: "secret-a"}); !ok || got != want {
		t.Errorf("Of(org-a) = %+v, %v, want %+v", got, ok, want)
	}
	if _, ok := idps.Of("org-c"); ok {
		t.Error("Of(org-c) は設定が無いので false にする")
	}
	if _, ok := idps.Of(""); ok {
		t.Error("Of(\"\") は false にする")
	}
}

// 開発用の例のファイルが、そのまま読めることを確認する。
func TestLoadExample(t *testing.T) {
	if _, err := upstream.Load("../../upstream-idps.example.json", "../../upstream-idp-client-secrets.example.json"); err != nil {
		t.Fatal(err)
	}
}

func TestLoadErrors(t *testing.T) {
	tests := []struct {
		name    string
		idps    string
		secrets string
		want    string
	}{
		{"一覧が空", `[]`, `{}`, "が空である"},
		{"JSON の形が違う", `{"org_id": "org-a"}`, validSecrets, "を読めない"},
		{"知らないキーがある", `[{"org_id": "org-a", "issuer": "https://accounts.example.com", "client_id": "client-a", "secret": "x"}]`, `{"org-a": "secret-a"}`, "を読めない"},
		{"org_id が無い", `[{"issuer": "https://accounts.example.com", "client_id": "client-a"}]`, `{"org-a": "secret-a"}`, "1 件目の org_id が空"},
		{"issuer が無い", `[{"org_id": "org-a", "client_id": "client-a"}]`, `{"org-a": "secret-a"}`, "org-a の issuer が空"},
		{"issuer が URL でない", `[{"org_id": "org-a", "issuer": "accounts.example.com", "client_id": "client-a"}]`, `{"org-a": "secret-a"}`, "http か https の URL"},
		{"client_id が空", `[{"org_id": "org-a", "issuer": "https://accounts.example.com", "client_id": " "}]`, `{"org-a": "secret-a"}`, "org-a の client_id が空"},
		{"org_id が重なる", `[{"org_id": "org-a", "issuer": "https://a.example.com", "client_id": "a"}, {"org_id": "org-a", "issuer": "https://b.example.com", "client_id": "b"}]`, `{"org-a": "secret-a"}`, "org-a が重なっている"},
		{"client secret が無い", validIdPs, `{"org-a": "secret-a"}`, "org_id org-b の値が無い"},
		{"client secret が空", validIdPs, `{"org-a": "secret-a", "org-b": ""}`, "org_id org-b の値が無い"},
		{"設定に無い組織の client secret がある", validIdPs, `{"org-a": "secret-a", "org-b": "secret-b", "org-c": "secret-c"}`, "org_id org-c が、上流の IdP の設定"},
		{"client secret のファイルが壊れている", validIdPs, `{"org-a": "secret-a",`, "client secret のファイル"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := upstream.Load(write(t, "idps.json", tt.idps), write(t, "secrets.json", tt.secrets))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("err = %v, want %q を含むエラー", err, tt.want)
			}
			if strings.Contains(err.Error(), "secret-") {
				t.Errorf("エラーの文に client secret の値が出ている: %v", err)
			}
		})
	}
}

func TestLoadMissingFile(t *testing.T) {
	dir := t.TempDir()
	if _, err := upstream.Load(filepath.Join(dir, "none.json"), write(t, "secrets.json", validSecrets)); err == nil {
		t.Error("上流の IdP の設定のファイルが無いときは、エラーにする")
	}
	if _, err := upstream.Load(write(t, "idps.json", validIdPs), filepath.Join(dir, "none.json")); err == nil {
		t.Error("client secret のファイルが無いときは、エラーにする")
	}
}
