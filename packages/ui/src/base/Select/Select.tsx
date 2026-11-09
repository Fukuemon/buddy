import { clsx } from 'clsx'
import type { ComponentPropsWithoutRef } from 'react'

import { ChevronDownIcon } from '../../icons/ChevronDownIcon'
import { fieldControlClassName } from '../FieldFrame/fieldClassName'

export type SelectProps = Omit<ComponentPropsWithoutRef<'select'>, 'className' | 'multiple'> & {
  /** true なら、一覧の絞り込みのように詰めた文字（`text-body-dense`）で出す。 */
  isDense?: boolean
  /** true なら、枠を 2px の文字の色にし、選んだ名前を太字にする。値を選んでいる絞り込みに使う。 */
  isEmphasized?: boolean
  /** true なら、欄を親の幅に広げる。false では選択肢の幅に合わせる。 */
  isWide?: boolean
}

/**
 * 決まった選択肢から 1 つを選ぶ欄。ブラウザの `select` を使い、標準の矢印を消して、右から 12px の位置に矢印の印を置く。
 * 状態ごとの枠と面は、入力の欄の共通のクラス（`fieldControlClassName`）に従う。
 * `FormField` の中では、`children` に渡される属性をそのまま渡す。
 */
export const Select = ({
  isDense = false,
  isEmphasized = false,
  isWide = true,
  children,
  ...props
}: SelectProps) => (
  <span className={clsx('relative inline-grid', isWide && 'w-full')}>
    <select
      {...props}
      className={clsx(
        // 右の余白は、矢印の 20px と、右の端からの 12px と、文字との間の 8px の合計
        'peer min-h-11 w-full appearance-none pr-10 pl-3',
        isDense ? 'text-body-dense' : 'text-body',
        fieldControlClassName,
        'data-emphasized:border-2 data-emphasized:border-text data-emphasized:font-bold',
      )}
      data-emphasized={isEmphasized || undefined}
    >
      {children}
    </select>
    <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-text-secondary peer-disabled:text-text-disabled" />
  </span>
)
