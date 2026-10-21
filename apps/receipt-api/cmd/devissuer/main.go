// Command devissuer は、手元で API を試すための偽物の OIDC の発行者である。本番とイメージには入れない。
//
// discovery の文書と JWKS を返し、GET /token で署名したトークンを JSON の access_token で返す。
// 鍵は起動のたびに作り直す。
//
//	go run ./cmd/devissuer -addr 127.0.0.1:9000
//	curl '127.0.0.1:9000/token?sub=dev-aoki&org_id=org-sample' | jq -r .access_token
//
// /token のクエリ:
//   - sub: 必須
//   - org_id: 組織のクレーム。クレームの名前は -org-claim で変える
//   - aud: 既定は -audience の値
package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"time"

	"github.com/Fukuemon/buddy/packages/go/oidc/oidctest"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:9000", "待ち受けるアドレス。発行者の URL は http://<addr> になる")
	audience := flag.String("audience", "receipt-api", "トークンの aud の既定値")
	orgClaim := flag.String("org-claim", "org_id", "組織のクレームの名前")
	flag.Parse()

	iss, err := oidctest.New("http://" + *addr)
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/", iss)
	mux.HandleFunc("GET /token", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("sub") == "" {
			http.Error(w, "sub は必須です", http.StatusBadRequest)
			return
		}
		aud := q.Get("aud")
		if aud == "" {
			aud = *audience
		}
		claims := iss.Claims(aud, q.Get("sub"))
		if org := q.Get("org_id"); org != "" {
			claims[*orgClaim] = org
		}
		raw, err := iss.Sign(claims)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"access_token": raw, "token_type": "Bearer"})
	})
	log.Printf("issuer %s", iss.URL())
	srv := &http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
