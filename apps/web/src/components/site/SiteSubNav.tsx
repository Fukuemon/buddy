import { clsx } from 'clsx'

import { tabClassName, type SiteNavLink } from './SiteNav'

export type SiteSubNavProps = {
  /** 読み上げる並びの名前。 */
  label: string
  /** 機能の中のタブ。 */
  items: readonly SiteNavLink[]
  /** 今の画面の href。そのタブに aria-current を付ける。 */
  current: string
}

/** 機能の中のタブ。画面の中身の上端に置く。今の画面のタブは、下線と aria-current で示す。 */
export const SiteSubNav = ({ label, items, current }: SiteSubNavProps) => (
  <nav
    aria-label={label}
    className="flex h-12 shrink-0 border-b border-border bg-surface px-2 desktop:px-4"
    data-testid="site-subnav"
  >
    <ul className="flex gap-1">
      {items.map((item) => (
        <li className="flex" key={item.href}>
          <a
            aria-current={item.href === current ? 'page' : undefined}
            className={clsx(tabClassName(item.href === current), 'text-body')}
            data-testid={`site-nav-${item.id}`}
            href={item.href}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  </nav>
)
