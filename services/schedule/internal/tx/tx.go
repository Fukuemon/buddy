// Package tx は、App がトランザクションの境界を決めるためのインターフェースを持つ。実装は DB のアダプタにある。
package tx

import "context"

// Transactor は、fn をトランザクションの中で実行する。fn に渡した ctx を受け取ったリポジトリの呼び出しは、
// そのトランザクションに加わる。fn が nil を返すとコミットし、それ以外はロールバックする。
type Transactor interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
