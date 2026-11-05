package login

import (
	"log/slog"
	"net/http"
	"slices"

	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
)

// consent は、GET /consent を受け、同意を自動で accept するクライアントと有効な職員の同意だけを受け入れ、ほかは拒む。
type consent struct {
	logger             *slog.Logger
	staff              Staff
	hydra              Hydra
	limiter            *Limiter
	clientIPHeader     string
	autoConsentClients []string
}

func (h consent) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if !admitClient(h.logger, h.limiter, h.clientIPHeader, fail, w, r) {
		return
	}
	challenge := r.URL.Query().Get("consent_challenge")
	if challenge == "" {
		fail(h.logger, w, r, http.StatusBadRequest, "consent_challenge がない", nil)
		return
	}
	req, err := h.hydra.ConsentRequest(ctx, challenge)
	if err != nil {
		fail(h.logger, w, r, http.StatusBadRequest, "同意の要求を読めない", err)
		return
	}
	// 同意の画面を持たないので、画面を出さずに accept してよいと決めたクライアントのほかは拒む
	if !slices.Contains(h.autoConsentClients, req.Client.ClientID) {
		h.logger.WarnContext(ctx, "同意を拒む", "reason", "同意を自動で accept するクライアントでない", "client_id", req.Client.ClientID)
		to, err := h.hydra.RejectConsent(ctx, challenge, hydra.AccessDenied)
		redirect(h.logger, w, r, to, err)
		return
	}
	m, err := h.staff.Get(ctx, req.Subject)
	if err != nil || !m.CanLogin() {
		h.logger.WarnContext(ctx, "同意を拒む", "reason", "職員が有効でない", "staff_id", req.Subject, "error", err)
		to, err := h.hydra.RejectConsent(ctx, challenge, hydra.AccessDenied)
		redirect(h.logger, w, r, to, err)
		return
	}
	to, err := h.hydra.AcceptConsent(ctx, challenge, hydra.AcceptConsent{
		GrantScope: req.RequestedScope,
		// web のクライアントに許した audience（schedule と receipt）を、そのまま access token の aud にする（ADR-0014）
		GrantAudience: req.Client.Audience,
		Session:       hydra.Session{AccessToken: map[string]any{"org_id": m.OrgID}},
	})
	redirect(h.logger, w, r, to, err)
}
