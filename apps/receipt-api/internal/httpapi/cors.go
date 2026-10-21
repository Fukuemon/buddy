package httpapi

import (
	"net/http"
	"slices"
)

// cors は、Config.AllowOrigins にある Origin の要求に CORS のヘッダーを付ける。AllowOrigins が空なら何もしない。
// 事前の要求（OPTIONS と Access-Control-Request-Method）には、トークンを求めずに 204 を返す。ブラウザは事前の要求に Authorization を付けないためである。
// 出典: https://fetch.spec.whatwg.org/#cors-preflight-fetch
// 許さない Origin の要求にはヘッダーを付けずに通すので、ブラウザが応答を読ませない。schedule-api（gin-contrib/cors）は 403 で止めるが、どちらもブラウザが応答を読ませない点は同じである。
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
