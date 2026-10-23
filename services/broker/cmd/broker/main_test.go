package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 上流の IdP の設定に必須の値が無いとき、DB に接続する前に、待ち受けを始めずにエラーで終わることを確かめる。
// DB の接続先は届かない宛先にし、DB に触れていればこのテストは別のエラーで失敗する。
func TestRunRejectsInvalidUpstreamConfig(t *testing.T) {
	dir := t.TempDir()
	idps := filepath.Join(dir, "idps.json")
	secrets := filepath.Join(dir, "secrets.json")
	if err := os.WriteFile(idps, []byte(`[{"org_id": "org-a", "client_id": "client-a"}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secrets, []byte(`{"org-a": "secret-a"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	env := map[string]string{
		"DB_HOST": "127.0.0.1", "DB_PORT": "1", "DB_USER": "broker", "DB_PASSWORD": "secret", "DB_NAME": "broker",
		"HYDRA_ADMIN_URL":                  "http://127.0.0.1:1",
		"UPSTREAM_IDPS_FILE":               idps,
		"UPSTREAM_IDP_CLIENT_SECRETS_FILE": secrets,
		"PUBLIC_URL":                       "http://127.0.0.1:1",
	}
	err := run(func(k string) string { return env[k] })
	if err == nil || !strings.Contains(err.Error(), "org-a の issuer が空") {
		t.Errorf("err = %v, want issuer が空のエラー", err)
	}
}
