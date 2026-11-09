package login

import (
	"log/slog"
	"net/http"
)

// logout は、Hydra のログアウトの要求を accept する。確認の画面は出さない。
// web はログアウトのボタンで BFF のセッションを消してからリダイレクトしてくるので、職員はもうログアウトを選んでいる。
type logout struct {
	logger         *slog.Logger
	hydra          Hydra
	limiter        *Limiter
	clientIPHeader string
}

func (h logout) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !admitClient(h.logger, h.limiter, h.clientIPHeader, failLogout, w, r) {
		return
	}
	challenge := r.URL.Query().Get("logout_challenge")
	if challenge == "" {
		failLogout(h.logger, w, r, http.StatusBadRequest, "logout_challenge がない", nil)
		return
	}
	to, err := h.hydra.AcceptLogout(r.Context(), challenge)
	if err != nil {
		failLogout(h.logger, w, r, http.StatusBadGateway, "Hydra にログアウトを返せない", err)
		return
	}
	http.Redirect(w, r, to, http.StatusSeeOther)
}
