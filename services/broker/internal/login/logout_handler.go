package login

import "net/http"

// logout は、Hydra のログアウトの要求を accept する。確認の画面は出さない。
// web はログアウトのボタンで BFF のセッションを消してからリダイレクトしてくるので、職員はもうログアウトを選んでいる。
func (h handler) logout(w http.ResponseWriter, r *http.Request) {
	challenge := r.URL.Query().Get("logout_challenge")
	if challenge == "" {
		h.failLogout(w, r, http.StatusBadRequest, "logout_challenge がない", nil)
		return
	}
	to, err := h.Hydra.AcceptLogout(r.Context(), challenge)
	if err != nil {
		h.failLogout(w, r, http.StatusBadGateway, "Hydra にログアウトを返せない", err)
		return
	}
	http.Redirect(w, r, to, http.StatusSeeOther)
}
