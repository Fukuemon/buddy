package internalapi

import (
	"encoding/json"
	"io"
	"log/slog"
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

// register は、POST /internal/staff を受け、職員を登録の途中の状態で登録する。
type register struct {
	logger   *slog.Logger
	staff    Store
	knownOrg func(orgID string) bool
	newID    func() string
}

func (h register) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OrgID string `json:"org_id"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxBodyLen)).Decode(&in); err != nil {
		writeError(h.logger, w, r, http.StatusBadRequest, "invalid", "本文を読めません", err)
		return
	}
	email := staff.NormalizeEmail(in.Email)
	if !staff.IsValidEmail(email) {
		writeError(h.logger, w, r, http.StatusBadRequest, "invalid", "メールの形式が正しくありません", nil)
		return
	}
	if !h.knownOrg(in.OrgID) {
		writeError(h.logger, w, r, http.StatusBadRequest, "invalid", "組織の上流の IdP の設定がありません", nil)
		return
	}
	m, created, err := h.staff.Register(r.Context(), staff.Member{
		ID: h.newID(), OrgID: in.OrgID, Email: email, Status: staff.StatusPending,
	})
	if err != nil {
		writeStoreError(h.logger, w, r, err, "職員を登録できません")
		return
	}
	code := http.StatusOK
	if created {
		code = http.StatusCreated
		h.logger.InfoContext(r.Context(), "職員を登録した", "staff_id", m.ID, "org_id", m.OrgID)
	}
	WriteJSON(h.logger, w, code, staffBody{ID: m.ID, OrgID: m.OrgID, Email: m.Email, Status: m.Status})
}

// activate は、POST /internal/staff/{id}/activate を受け、登録の途中の職員を有効にする。
type activate struct {
	logger *slog.Logger
	staff  Store
}

func (h activate) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.staff.Activate(r.Context(), id); err != nil {
		writeStoreError(h.logger, w, r, err, "職員を有効にできません")
		return
	}
	h.logger.InfoContext(r.Context(), "職員を有効にした", "staff_id", id)
	w.WriteHeader(http.StatusNoContent)
}

// deleteStaff は、DELETE /internal/staff/{id} を受け、登録の途中の職員を消す。組み込みの delete と重ならない名前にする。
type deleteStaff struct {
	logger *slog.Logger
	staff  Store
}

func (h deleteStaff) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.staff.Delete(r.Context(), id); err != nil {
		writeStoreError(h.logger, w, r, err, "職員を消せません")
		return
	}
	h.logger.InfoContext(r.Context(), "職員を消した", "staff_id", id)
	w.WriteHeader(http.StatusNoContent)
}

// suspend は、職員を止めてから、Hydra のログインのセッションと同意を取り消す。取り消しに失敗したら、code が
// revoke_failed の 502 を返し、停止は書いたことを示す。職員は止めたままなので、token_hook がトークンを拒む。
// 呼び出し側は同じ要求を送り直して、取り消しをやり直せる。
type suspend struct {
	logger *slog.Logger
	staff  Store
	hydra  Hydra
}

func (h suspend) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	if err := h.staff.Suspend(ctx, id); err != nil {
		writeStoreError(h.logger, w, r, err, "職員を止められません")
		return
	}
	h.logger.InfoContext(ctx, "職員を止めた", "staff_id", id)
	revoke(h.logger, h.hydra, w, r, id)
}

// resume は、止めた職員を有効に戻す。上流のアカウントの結び付けは残すので、職員は同じ上流のアカウントでログインできる。
type resume struct {
	logger *slog.Logger
	staff  Store
}

func (h resume) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.staff.Resume(r.Context(), id); err != nil {
		writeStoreError(h.logger, w, r, err, "職員を戻せません")
		return
	}
	h.logger.InfoContext(r.Context(), "職員を戻した", "staff_id", id)
	w.WriteHeader(http.StatusNoContent)
}

// retire は、職員を退職にしてメールと上流のアカウントを消してから、Hydra のログインのセッションと同意を取り消す。
// 取り消しに失敗したときは suspend と同じく revoke_failed の 502 を返し、送り直しで取り消しをやり直させる。
type retire struct {
	logger *slog.Logger
	staff  Store
	hydra  Hydra
}

func (h retire) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	if err := h.staff.Retire(ctx, id); err != nil {
		writeStoreError(h.logger, w, r, err, "職員を退職にできません")
		return
	}
	h.logger.InfoContext(ctx, "職員を退職にした", "staff_id", id)
	revoke(h.logger, h.hydra, w, r, id)
}

// revoke は、職員 id の Hydra のログインのセッションと同意を取り消し、204 を返す。取り消せなければ revoke_failed の 502 を返す。
func revoke(logger *slog.Logger, hydra Hydra, w http.ResponseWriter, r *http.Request, id string) {
	ctx := r.Context()
	if err := hydra.RevokeLoginSessions(ctx, id); err != nil {
		writeError(logger, w, r, http.StatusBadGateway, "revoke_failed", "ログインのセッションを取り消せません", err)
		return
	}
	if err := hydra.RevokeConsentSessions(ctx, id); err != nil {
		writeError(logger, w, r, http.StatusBadGateway, "revoke_failed", "同意を取り消せません", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
