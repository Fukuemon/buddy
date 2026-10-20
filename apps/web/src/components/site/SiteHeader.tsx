import type { ReactNode } from 'react'

export type SiteHeaderProps = {
  /** 右端に置く要素。ログインの後に利用者の名前を置く。 */
  actions?: ReactNode
}

/** buddy の画面の上端の帯。 */
export const SiteHeader = ({ actions }: SiteHeaderProps) => (
  <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-gray-0 px-6">
    <span className="text-lg font-bold tracking-wide text-action-main">buddy</span>
    {actions}
  </header>
)
