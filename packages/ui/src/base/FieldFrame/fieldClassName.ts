/*
 * 入力の欄の枠の見た目。デフォルト、hover、フォーカス、無効、エラーの状態を、全ての入力のコンポーネントでそろえる。
 * 見た目は DADS のインプットテキストに合わせる（packages/ui/DESIGN.md の「入力の欄の状態」）。
 * 枠は ring（box-shadow）ではなく border で引く。focus-ring の黄色の縁が box-shadow なので、ring で引くと上書きし合う。
 */

/** input、select、textarea に直に付ける枠の見た目。大きさと余白は使う側が足す。 */
export const fieldControlClassName = [
  'rounded-8 border border-border-field bg-surface focus-visible:focus-ring',
  'enabled:hover:not-aria-invalid:border-border-field-hover',
  'aria-invalid:border-2 aria-invalid:border-danger enabled:hover:aria-invalid:border-danger-hover',
  'disabled:bg-surface-disabled disabled:text-text-disabled',
].join(' ')

/**
 * 中に input を 1 つ置く枠（label など）に付ける見た目。中の input の状態を :has で読む。
 * 中の input には outline-none を付け、枠の外にフォーカスの表示を出す。
 */
export const fieldBoxClassName = [
  'rounded-8 border border-border-field bg-surface has-[:focus-visible]:focus-ring',
  'hover:not-has-[:disabled]:not-has-[[aria-invalid=true]]:border-border-field-hover',
  'has-[[aria-invalid=true]]:border-2 has-[[aria-invalid=true]]:border-danger',
  'hover:not-has-[:disabled]:has-[[aria-invalid=true]]:border-danger-hover',
  'has-[:disabled]:bg-surface-disabled',
].join(' ')
