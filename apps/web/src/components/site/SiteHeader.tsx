import type { ReactNode } from 'react'

export type SiteHeaderProps = {
  /** 名前の左に置く、左のサイドバーを開閉するボタン。 */
  menuButton?: ReactNode
  /** 右端に置く要素。ログインの後にアカウントのボタンを置く。 */
  actions?: ReactNode
}

/** buddy の画面の上端の帯。 */
export const SiteHeader = ({ menuButton, actions }: SiteHeaderProps) => (
  <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-2">
    <div className="flex items-center gap-2">
      {menuButton}
      <span className="text-heading-sm text-primary">buddy</span>
    </div>
    {actions}
  </header>
)
