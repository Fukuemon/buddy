package login

import (
	"bytes"
	"embed"
	"html/template"
	"log/slog"
	"net/http"
)

// pageFiles は、apps/broker が src/pages.tsx から生成した画面のテンプレートと CSS である（ADR-0025）。
// ファイルの名前（拡張子を除く）が、render に渡す画面の名前になる。
//
//go:embed pages/*.html pages/pages.css
var pageFiles embed.FS

// pages は、画面のテンプレートである。テンプレートは {{css}} で CSS を、ログインの画面は {{.Challenge}} で login_challenge を埋める。
// ログインの失敗の画面の文言は、web のログインの失敗の画面と同じ apps/broker の定数から生成する。
var pages = func() *template.Template {
	css, err := pageFiles.ReadFile("pages/pages.css")
	if err != nil {
		panic(err)
	}
	return template.Must(template.New("").Funcs(template.FuncMap{
		"css": func() template.CSS { return template.CSS(css) },
	}).ParseFS(pageFiles, "pages/*.html"))
}()

func render(w http.ResponseWriter, logger *slog.Logger, code int, name string, data any) {
	var buf bytes.Buffer
	if err := pages.ExecuteTemplate(&buf, name+".html", data); err != nil {
		logger.Error("画面を書けない", "page", name, "error", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	// ほかのサイトの frame に入れて、メールの入力を盗み見る操作をさせない
	w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'")
	w.WriteHeader(code)
	_, _ = buf.WriteTo(w)
}

func renderLogin(w http.ResponseWriter, logger *slog.Logger, challenge string) {
	render(w, logger, http.StatusOK, "login", struct{ Challenge string }{challenge})
}
