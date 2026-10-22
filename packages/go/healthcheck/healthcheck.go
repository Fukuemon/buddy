// Package healthcheck は、イメージの中で API がリクエストを受けられるかを確かめる、`api healthcheck` のサブコマンドを持つ。
// 予定の API と照合の API が共有する module packages/go にある（ADR-0007）。
package healthcheck

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"time"
)

// Run は、同じコンテナで動く API の GET /readyz を呼び、200 なら 0、それ以外なら 1 を返す。
// curl の無いイメージで、compose のヘルスチェックに使う。ポートは API と同じ環境変数 PORT から読む。
func Run() int {
	port := 8080
	if v := os.Getenv("PORT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return 1
		}
		port = n
	}
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/readyz", port)) //nolint:gosec // G704 の誤検知。宛先は 127.0.0.1 に固定で、環境変数はポートだけを決める
	if err != nil {
		return 1
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
