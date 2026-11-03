package internalapi

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/Fukuemon/buddy/services/broker/internal/staff"
)

// staffBody は、内部の API の職員である。
type staffBody struct {
	ID     string `json:"id"`
	OrgID  string `json:"org_id"`
	Email  string `json:"email"`
	Status string `json:"status"`
}

func (h handler) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OrgID string `json:"org_id"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBodyLen)).Decode(&in); err != nil {
		h.writeError(w, r, http.StatusBadRequest, "invalid", "本文を読めません", err)
		return
	}
	email := staff.NormalizeEmail(in.Email)
	if !staff.IsValidEmail(email) {
		h.writeError(w, r, http.StatusBadRequest, "invalid", "メールの形式が正しくありません", nil)
		return
	}
	if !h.KnownOrg(in.OrgID) {
		h.writeError(w, r, http.StatusBadRequest, "invalid", "組織の上流の IdP の設定がありません", nil)
		return
	}
	m, created, err := h.Staff.Register(r.Context(), staff.Member{
		ID: h.NewID(), OrgID: in.OrgID, Email: email, Status: staff.StatusPending,
	})
	if err != nil {
		h.writeStoreError(w, r, err, "職員を登録できません")
		return
	}
	code := http.StatusOK
	if created {
		code = http.StatusCreated
		h.Logger.InfoContext(r.Context(), "職員を登録した", "staff_id", m.ID, "org_id", m.OrgID)
	}
	WriteJSON(h.Logger, w, code, staffBody{ID: m.ID, OrgID: m.OrgID, Email: m.Email, Status: m.Status})
}

func (h handler) activate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Staff.Activate(r.Context(), id); err != nil {
		h.writeStoreError(w, r, err, "職員を有効にできません")
		return
	}
	h.Logger.InfoContext(r.Context(), "職員を有効にした", "staff_id", id)
	w.WriteHeader(http.StatusNoContent)
}

func (h handler) delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Staff.Delete(r.Context(), id); err != nil {
		h.writeStoreError(w, r, err, "職員を消せません")
		return
	}
	h.Logger.InfoContext(r.Context(), "職員を消した", "staff_id", id)
	w.WriteHeader(http.StatusNoContent)
}

// suspend は、職員を止めてから、Hydra のログインのセッションと同意を取り消す。取り消しに失敗したら、code が
// revoke_failed の 502 を返し、停止は書いたことを示す。職員は止めたままなので、token_hook がトークンを拒む。
// 呼び出し側は同じ要求を送り直して、取り消しをやり直せる。
func (h handler) suspend(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	if err := h.Staff.Suspend(ctx, id); err != nil {
		h.writeStoreError(w, r, err, "職員を止められません")
		return
	}
	h.Logger.InfoContext(ctx, "職員を止めた", "staff_id", id)
	h.revoke(w, r, id)
}

// resume は、止めた職員を有効に戻す。上流のアカウントの結び付けは残すので、職員は同じ上流のアカウントでログインできる。
func (h handler) resume(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Staff.Resume(r.Context(), id); err != nil {
		h.writeStoreError(w, r, err, "職員を戻せません")
		return
	}
	h.Logger.InfoContext(r.Context(), "職員を戻した", "staff_id", id)
	w.WriteHeader(http.StatusNoContent)
}

// retire は、職員を退職にしてメールと上流のアカウントを消してから、Hydra のログインのセッションと同意を取り消す。
// 取り消しに失敗したときは suspend と同じく revoke_failed の 502 を返し、送り直しで取り消しをやり直させる。
func (h handler) retire(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	if err := h.Staff.Retire(ctx, id); err != nil {
		h.writeStoreError(w, r, err, "職員を退職にできません")
		return
	}
	h.Logger.InfoContext(ctx, "職員を退職にした", "staff_id", id)
	h.revoke(w, r, id)
}

// revoke は、職員 id の Hydra のログインのセッションと同意を取り消し、204 を返す。取り消せなければ revoke_failed の 502 を返す。
func (h handler) revoke(w http.ResponseWriter, r *http.Request, id string) {
	ctx := r.Context()
	if err := h.Hydra.RevokeLoginSessions(ctx, id); err != nil {
		h.writeError(w, r, http.StatusBadGateway, "revoke_failed", "ログインのセッションを取り消せません", err)
		return
	}
	if err := h.Hydra.RevokeConsentSessions(ctx, id); err != nil {
		h.writeError(w, r, http.StatusBadGateway, "revoke_failed", "同意を取り消せません", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
