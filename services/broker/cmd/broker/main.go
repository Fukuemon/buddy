// Command broker は、Ory Hydra の login and consent app として動く ID ブローカーを起動する（ADR-0016）。
// ログイン、同意、ログアウトの画面、職員の登録、休職、復職、退職の内部の API、Hydra の oauth2.token_hook、ヘルスチェックを持つ。
// ログイン、同意、ログアウトの画面は PORT で、内部の API と token_hook は INTERNAL_PORT で待ち受ける。内部のポートはブラウザに開かない。
//
// 設定は環境変数から読む。読む値とデフォルト値は config.Load にある。
// 上流の IdP の設定のファイルか client secret のファイルに誤りがあれば、待ち受けを始めずに終了コード 1 で終わる。
//
// `broker healthcheck` は、サーバーを起動せず、動いているサーバーの GET /readyz を確認して終わる。
//
// SIGINT か SIGTERM を受けると、処理中のリクエストを待ってから終了する。
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/Fukuemon/buddy/packages/go/healthcheck"
	"github.com/Fukuemon/buddy/packages/go/oidc"

	"github.com/Fukuemon/buddy/services/broker/internal/config"
	"github.com/Fukuemon/buddy/services/broker/internal/httpapi"
	"github.com/Fukuemon/buddy/services/broker/internal/hydra"
	"github.com/Fukuemon/buddy/services/broker/internal/internalapi"
	"github.com/Fukuemon/buddy/services/broker/internal/login"
	"github.com/Fukuemon/buddy/services/broker/internal/postgres"
	"github.com/Fukuemon/buddy/services/broker/internal/upstream"
)

// readyTimeout は、GET /readyz が DB の疎通を待つ上限である。
const readyTimeout = 2 * time.Second

// ログインの画面を開く試行とメールを送る試行は、送信元の IP アドレスごとに loginBurst 回まで続けられ、loginEvery ごとに 1 回ずつ戻る。
// 1 回のログインで GET と POST の 2 回を数えるので、ログインの回数では、続けて 20 回、以後は 10 秒に 1 回になる。
// 入れたメールごとには emailBurst 回まで続けられ、emailEvery ごとに 1 回ずつ戻る。
// 上限を超えた職員に web が出す「30 秒ほどおいてから」の文（apps/web の AuthErrorMessage）は、長い方の emailEvery に合わせている。
const (
	loginBurst = 40
	loginEvery = 5 * time.Second
	emailBurst = 10
	emailEvery = 30 * time.Second
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck.Run())
	}
	if err := run(os.Getenv); err != nil {
		slog.Error("終了する", "error", err)
		os.Exit(1)
	}
}

// run は、getenv（本番では os.Getenv）の設定でブローカーを起動し、止まる合図を受けるまで待ち受ける。
// 上流の IdP の設定は DB に接続する前に読み、誤りがあれば DB に触れずにエラーを返す。
func run(getenv func(string) string) error {
	cfg, err := config.Load(getenv)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.LogLevel}))

	idps, err := upstream.Load(cfg.UpstreamIdPsFile, cfg.UpstreamClientSecretsFile)
	if err != nil {
		return err
	}
	logger.Info("上流の IdP の設定を読んだ", "count", len(idps))
	rp, err := upstream.NewRP(idps, cfg.PublicURL+"/login/callback", cfg.UpstreamBrowserOrigin, nil)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := postgres.Open(ctx, postgres.Config(cfg.DB))
	if err != nil {
		return err
	}
	defer db.Close()

	verifier := &lazyVerifier{ctx: ctx, cfg: oidc.Config{Issuer: cfg.HydraIssuer, Audience: cfg.InternalAPIAudience, OrgClaim: "org_id"}, log: logger}
	staff := postgres.NewStaffStore(db)
	hydraAdmin := hydra.New(cfg.HydraAdminURL, nil)
	loginHandler, err := login.NewHandler(login.Config{
		Logger:             logger,
		Staff:              staff,
		Hydra:              hydraAdmin,
		Upstream:           rp,
		Limiter:            login.NewLimiter(loginEvery, loginBurst),
		EmailLimiter:       login.NewLimiter(emailEvery, emailBurst),
		ClientIPHeader:     cfg.ClientIPHeader,
		PublicURL:          cfg.PublicURL,
		AutoConsentClients: cfg.AutoConsentClients,
		SecureCookie:       strings.HasPrefix(cfg.PublicURL, "https:"),
	})
	if err != nil {
		return err
	}

	ready := func(ctx context.Context) error {
		ctx, cancel := context.WithTimeout(ctx, readyTimeout)
		defer cancel()
		return db.Ping(ctx)
	}
	servers := []*http.Server{
		newServer(logger, cfg.Port, httpapi.NewHandler(httpapi.Config{Logger: logger, Ready: ready, Login: loginHandler})),
		newServer(logger, cfg.InternalPort, httpapi.NewHandler(httpapi.Config{
			Logger: logger,
			Ready:  ready,
			Internal: internalapi.NewHandler(internalapi.Config{
				Logger:       logger,
				Staff:        staff,
				Hydra:        hydraAdmin,
				Verifier:     verifier,
				Clients:      cfg.InternalAPIClients,
				KnownOrg:     func(orgID string) bool { _, ok := idps.Of(orgID); return ok },
				NewID:        func() string { return ulid.Make().String() },
				TokenHookKey: cfg.TokenHookKey,
			}),
		})),
	}

	errCh := make(chan error, len(servers))
	for _, srv := range servers {
		go func() {
			logger.Info("待ち受けを始める", "addr", srv.Addr)
			errCh <- srv.ListenAndServe()
		}()
	}

	var serveErr error
	select {
	case serveErr = <-errCh:
	case <-ctx.Done():
	}

	logger.Info("終了の処理を始める")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	errs := []error{serveErr}
	for _, srv := range servers {
		errs = append(errs, srv.Shutdown(shutdownCtx))
	}
	// 片方が待ち受けに失敗したときは、その戻り値を serveErr で受け取っているので、残りの戻り値だけを待つ
	n := len(servers)
	if serveErr != nil {
		n--
	}
	for range n {
		if err := <-errCh; !errors.Is(err, http.ErrServerClosed) {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// newServer は、port で handler を待ち受ける http.Server を作る。
func newServer(logger *slog.Logger, port string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              net.JoinHostPort("", port),
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}
}

// lazyVerifier は、内部の API が初めて access token を受けたときに、Hydra の discovery の文書を読んで oidc.Verifier を作る。
// 起動の時に読まないのは、ログインの画面を Hydra の issuer に届かない構成（ローカル環境で go run するブローカー）でも
// 動かすためである。読めなければ、その呼び出しを失敗にし、次の呼び出しで読み直す。
type lazyVerifier struct {
	ctx context.Context
	cfg oidc.Config
	log *slog.Logger
	mu  sync.Mutex
	v   *oidc.Verifier
}

// Verify は、作った oidc.Verifier で raw を検証する。
func (l *lazyVerifier) Verify(ctx context.Context, raw string) (oidc.Identity, error) {
	l.mu.Lock()
	if l.v == nil {
		v, err := oidc.NewVerifier(l.ctx, l.cfg, nil, l.log)
		if err != nil {
			l.mu.Unlock()
			return oidc.Identity{}, err
		}
		l.v = v
	}
	v := l.v
	l.mu.Unlock()
	return v.Verify(ctx, raw)
}
