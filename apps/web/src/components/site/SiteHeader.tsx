import type { ReactNode } from 'react'

export type SiteHeaderProps = {
  /** 名前の左に置く、左の欄を開閉するボタン。左の欄がある画面だけで渡す。 */
  menuButton?: ReactNode
  /** 名前の右に置く、機能のタブ。 */
  nav?: ReactNode
  /** 右端に置く要素。ログインの後にアカウントのボタンを置く。 */
  actions?: ReactNode
}

/** buddy の画面の上端の帯。 */
export const SiteHeader = ({ menuButton, nav, actions }: SiteHeaderProps) => (
  <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-2 desktop:px-4">
    <div className="flex items-center gap-2 self-stretch desktop:gap-4">
      {menuButton}
      <span className="text-heading-sm text-primary">buddy</span>
      {nav}
    </div>
    {actions}
  </header>
)
