package login

import (
	"bytes"
	"html/template"
	"log/slog"
	"net/http"
)

// 文言は、web のログインの失敗の画面（apps/web の AuthErrorMessage の failed）と同じにする。
// 登録されていないメールと、ブローカーの中の失敗を、画面で区別できないようにするためである。
var pages = template.Must(template.New("").Parse(`{{define "head"}}<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>buddy にログイン</title>
<style>
  body { margin: 0; font-family: "Noto Sans JP", system-ui, sans-serif; color: #1a1a1c; background: #f8f8fb; }
  main { max-width: 28rem; margin: 10vh auto; padding: 2rem; background: #fff; border: 1px solid #d8d8db; border-radius: 8px; }
  h1 { margin: 0 0 1.5rem; font-size: 1.5rem; }
  label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
  input[type=email] { box-sizing: border-box; width: 100%; padding: 0.75rem; font-size: 1rem; border: 1px solid #949497; border-radius: 8px; }
  button { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; font-size: 1rem; border-radius: 8px; color: #fff; background: #0031d8; border: 0; cursor: pointer; }
  p { line-height: 1.7; }
</style>
</head>
<body><main>{{end}}
{{define "foot"}}</main></body>
</html>
{{end}}
{{define "login"}}{{template "head"}}
<h1>buddy にログイン</h1>
<form method="post" action="/login">
  <input type="hidden" name="login_challenge" value="{{.Challenge}}">
  <label for="email">メールアドレス</label>
  <input id="email" type="email" name="email" required autocomplete="email" autofocus>
  <p>事業所に登録したメールアドレスを入れてください。事業所のログインの画面へ移ります。</p>
  <button type="submit">次へ</button>
</form>
{{template "foot"}}{{end}}
{{define "failure"}}{{template "head"}}
<section>
  <h1>ログインできませんでした</h1>
  <p>時間をおいて、もう一度ログインしてください。</p>
</section>
{{template "foot"}}{{end}}
`))

func render(w http.ResponseWriter, logger *slog.Logger, code int, name string, data any) {
	var buf bytes.Buffer
	if err := pages.ExecuteTemplate(&buf, name, data); err != nil {
		logger.Error("画面を書けない", "page", name, "error", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_, _ = buf.WriteTo(w)
}

func renderLogin(w http.ResponseWriter, logger *slog.Logger, challenge string) {
	render(w, logger, http.StatusOK, "login", struct{ Challenge string }{challenge})
}

func renderFailure(w http.ResponseWriter, logger *slog.Logger, code int) {
	render(w, logger, code, "failure", nil)
}
