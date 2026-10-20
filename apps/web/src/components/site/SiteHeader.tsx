import type { ReactNode } from 'react'

export type SiteHeaderProps = {
  /** 名前の右に置く、画面の間を移るリンク。 */
  nav?: ReactNode
  /** 右端に置く要素。ログインの後に利用者の名前を置く。 */
  actions?: ReactNode
}

/** buddy の画面の上端の帯。 */
export const SiteHeader = ({ nav, actions }: SiteHeaderProps) => (
  <header className="flex h-14 shrink-0 items-center justify-between gap-6 border-b border-border bg-surface px-6">
    <div className="flex items-center gap-8">
      <span className="text-heading-sm text-primary">buddy</span>
      {nav}
    </div>
    {actions}
  </header>
)
