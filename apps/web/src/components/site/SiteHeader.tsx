import type { ReactNode } from 'react'

export type SiteHeaderProps = {
  /** 名前の左に置く、左の欄を開閉するボタン。左の欄がある画面だけで渡す。 */
  menuButton?: ReactNode
  /** 名前の右に置く、今の機能の名前。 */
  title?: string
  /** 右端に置く要素。取り込みと要確認のボタン、アプリのボタン、アカウントのボタンを、この順に置く。 */
  actions?: ReactNode
}

/** buddy の画面の上端の帯。 */
export const SiteHeader = ({ menuButton, title, actions }: SiteHeaderProps) => (
  <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-2 desktop:px-4">
    <div className="flex min-w-0 items-center gap-2">
      {menuButton}
      <span className="text-heading-sm text-primary">buddy</span>
      {title !== undefined && (
        <span className="ml-2 truncate text-heading-sm" data-testid="site-title">
          {title}
        </span>
      )}
    </div>
    {actions !== undefined && <div className="flex items-center gap-1">{actions}</div>}
  </header>
)
