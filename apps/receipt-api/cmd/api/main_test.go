package main

import (
	"log/slog"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	env := func(m map[string]string) func(string) string {
		return func(k string) string { return m[k] }
	}
	cfg, err := loadConfig(env(nil))
	if err != nil || cfg.port != "8080" || cfg.maxUploadBytes != 10<<20 || cfg.logLevel != slog.LevelInfo {
		t.Errorf("既定値 = %+v, %v", cfg, err)
	}
	cfg, err = loadConfig(env(map[string]string{"PORT": "9000", "MAX_UPLOAD_BYTES": "2048", "LOG_LEVEL": "debug"}))
	if err != nil || cfg.port != "9000" || cfg.maxUploadBytes != 2048 || cfg.logLevel != slog.LevelDebug {
		t.Errorf("設定 = %+v, %v", cfg, err)
	}
	for _, bad := range []map[string]string{{"MAX_UPLOAD_BYTES": "0"}, {"MAX_UPLOAD_BYTES": "x"}, {"LOG_LEVEL": "loud"}} {
		if _, err := loadConfig(env(bad)); err == nil {
			t.Errorf("%v でエラーにならない", bad)
		}
	}
}
