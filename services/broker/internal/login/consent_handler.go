package login

import (
	"net/http"
	"slices"

	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
)

func (h handler) consent(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	challenge := r.URL.Query().Get("consent_challenge")
	if challenge == "" {
		h.fail(w, r, http.StatusBadRequest, "consent_challenge がない", nil)
		return
	}
	req, err := h.Hydra.ConsentRequest(ctx, challenge)
	if err != nil {
		h.fail(w, r, http.StatusBadRequest, "同意の要求を読めない", err)
		return
	}
	// 同意の画面を持たないので、画面を出さずに accept してよいと決めたクライアントのほかは拒む
	if !slices.Contains(h.AutoConsentClients, req.Client.ClientID) {
		h.Logger.WarnContext(ctx, "同意を拒む", "reason", "同意を自動で accept するクライアントでない", "client_id", req.Client.ClientID)
		to, err := h.Hydra.RejectConsent(ctx, challenge, hydra.AccessDenied)
		h.redirect(w, r, to, err)
		return
	}
	m, err := h.Staff.Get(ctx, req.Subject)
	if err != nil || !m.CanLogin() {
		h.Logger.WarnContext(ctx, "同意を拒む", "reason", "職員が有効でない", "staff_id", req.Subject, "error", err)
		to, err := h.Hydra.RejectConsent(ctx, challenge, hydra.AccessDenied)
		h.redirect(w, r, to, err)
		return
	}
	to, err := h.Hydra.AcceptConsent(ctx, challenge, hydra.AcceptConsent{
		GrantScope: req.RequestedScope,
		// web のクライアントに許した audience（schedule と receipt）を、そのまま access token の aud にする（ADR-0016）
		GrantAudience: req.Client.Audience,
		Session:       hydra.Session{AccessToken: map[string]any{"org_id": m.OrgID}},
	})
	h.redirect(w, r, to, err)
}
