package healthcheck

import "testing"

// ci-result が go のジョブの失敗で失敗するかを確認するための、一時的に失敗するテスト。確認したら消す。
func TestCIResultTemporaryFailure(t *testing.T) {
	t.Fatal("ci-result の確認のために失敗させる")
}
