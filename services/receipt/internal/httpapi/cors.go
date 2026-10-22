package httpapi

import (
	"net/http"
	"slices"
)

// cors は、Config.AllowOrigins にある Origin のリクエストに CORS のヘッダーを付ける。AllowOrigins が空なら何もしない。
// 事前のリクエスト（OPTIONS と Access-Control-Request-Method）には、トークンを求めずに 204 を返す。ブラウザは事前のリクエストに Authorization を付けないためである。
// 出典: https://fetch.spec.whatwg.org/#cors-preflight-fetch
// 許さない Origin のリクエストにはヘッダーを付けずに通すので、ブラウザがレスポンスを読ませない。予定の API（gin-contrib/cors）は 403 で止めるが、どちらもブラウザがレスポンスを読ませない点は同じである。
func (s *server) cors(next http.Handler) http.Handler {
	if len(s.cfg.AllowOrigins) == 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Origin")
		origin := r.Header.Get("Origin")
		if origin == "" || !slices.Contains(s.cfg.AllowOrigins, origin) {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "43200")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
