package login

import (
	"bytes"
	_ "embed"
	"html/template"
	"log/slog"
	"net/http"
)

// tokensCSS は、画面が使う packages/ui のトークンの値。scripts/build-broker-tokens.mjs が生成する。
//
//go:embed tokens.css
var tokensCSS string

// 文言は、web のログインの失敗の画面（apps/web の AuthErrorMessage の failed）と同じにする。
// 登録されていないメールと、ブローカーの中の失敗を、画面で区別できないようにするためである。
// 見た目は、web と同じトークンの値で、画面の背景の中央に白いカードを置き、上端にロゴを出す。
var pages = template.Must(template.New("").Funcs(template.FuncMap{
	"tokens": func() template.CSS { return template.CSS(tokensCSS) },
}).Parse(`{{define "head"}}<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>buddy にログイン</title>
<style>
{{tokens}}
  *, *::before, *::after { box-sizing: border-box; }
  body {
    display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1rem;
    font-family: var(--font-family-sans); font-size: var(--font-size-16); line-height: var(--line-height-170); letter-spacing: 0.02em;
    color: var(--buddy-color-text); background: var(--buddy-color-surface-canvas);
  }
  main {
    width: 100%; max-width: 32rem; padding: 2.5rem 1.5rem;
    background: var(--buddy-color-surface); border: 1px solid var(--buddy-color-border); border-radius: var(--border-radius-8);
  }
  .logo {
    margin: 0; text-align: center; color: var(--buddy-color-primary);
    font-size: var(--font-size-20); font-weight: var(--font-weight-700); line-height: var(--line-height-150);
  }
  h1 {
    margin: 0.5rem 0 2rem; text-align: center;
    font-size: var(--font-size-18); font-weight: var(--font-weight-700); line-height: var(--line-height-160);
  }
  label { display: block; margin-bottom: 0.5rem; font-weight: var(--font-weight-700); line-height: var(--line-height-100); }
  input[type=email] {
    display: block; width: 100%; min-height: 3rem; padding: 0.75rem 1rem;
    font: inherit; line-height: var(--line-height-130); letter-spacing: normal; color: var(--buddy-color-text);
    background: var(--buddy-color-surface); border: 1px solid var(--buddy-color-border-field); border-radius: var(--border-radius-8);
  }
  .hint { margin: 0.5rem 0 0; font-size: var(--font-size-14); line-height: var(--line-height-130); color: var(--buddy-color-text-secondary); }
  button {
    display: block; width: 100%; min-height: 3rem; margin-top: 2rem; padding: 0.75rem 1rem;
    font: inherit; font-weight: var(--font-weight-700); line-height: var(--line-height-100);
    color: var(--buddy-color-text-inverse); background: var(--buddy-color-primary); border: 0; border-radius: var(--border-radius-8); cursor: pointer;
  }
  /* DADS のフォーカスの表示（packages/ui の focus-ring と同じ） */
  input:focus-visible, button:focus-visible {
    outline: 4px solid var(--buddy-color-focus-outline); outline-offset: 2px; box-shadow: 0 0 0 2px var(--buddy-color-focus-halo);
  }
  section > h1 { margin-bottom: 1rem; }
  section > p { margin: 0; text-align: center; }
  @media (min-width: 48rem) {
    main { padding: 3.5rem 4.5rem; }
  }
</style>
</head>
<body><main>
<p class="logo" aria-hidden="true">buddy</p>{{end}}
{{define "foot"}}</main></body>
</html>
{{end}}
{{define "login"}}{{template "head"}}
<h1>buddy にログイン</h1>
<form method="post" action="/login">
  <input type="hidden" name="login_challenge" value="{{.Challenge}}">
  <label for="email">メールアドレス</label>
  <input id="email" type="email" name="email" required autocomplete="email" autofocus aria-describedby="email-hint">
  <p id="email-hint" class="hint">事業所に登録したメールアドレスを入れてください。事業所のログインの画面へ移ります。</p>
  <button type="submit">次へ</button>
</form>
{{template "foot"}}{{end}}
{{define "failure"}}{{template "head"}}
<section>
  <h1>ログインできませんでした</h1>
  <p>時間をおいて、もう一度ログインしてください。</p>
</section>
{{template "foot"}}{{end}}
{{define "logoutFailure"}}{{template "head"}}
<section>
  <h1>ログアウトできませんでした</h1>
  <p>時間をおいて、もう一度 buddy を開いてログアウトしてください。</p>
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
	// ほかのサイトの frame に入れて、メールの入力を盗み見る操作をさせない
	w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'")
	w.WriteHeader(code)
	_, _ = buf.WriteTo(w)
}

func renderLogin(w http.ResponseWriter, logger *slog.Logger, challenge string) {
	render(w, logger, http.StatusOK, "login", struct{ Challenge string }{challenge})
}
