// Package tx は、App がトランザクションの境界を決めるためのインターフェースを持つ。実装は DB のアダプタにある。
package tx

import "context"

// Transactor は、fn をトランザクションの中で実行する。fn に渡した ctx を受け取ったリポジトリの呼び出しは、
// そのトランザクションに加わる。fn が nil を返すとコミットし、それ以外はロールバックする。
// ctx が既にトランザクションを持つときは、新しく始めずにそれに加わり、コミットとロールバックは外のトランザクションに任せる。
// 操作が別の操作を呼んで、1 つのトランザクションで書く（staff.Onboard が staff.Create を呼ぶ）ためである。
type Transactor interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
