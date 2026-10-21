import { clsx } from 'clsx'

/** 並びの 1 つのリンク。 */
export type SiteNavItem = { href: string; label: string }

export type SiteNavProps = {
  items: readonly SiteNavItem[]
  /** 今の画面の href。そのリンクに aria-current を付ける。 */
  current: string
}

/** ヘッダーの、画面の間を移るリンクの並び。 */
export const SiteNav = ({ items, current }: SiteNavProps) => (
  <nav aria-label="画面" data-testid="site-nav">
    <ul className="flex desktop:gap-2">
      {items.map((item) => (
        <li key={item.href}>
          <a
            href={item.href}
            aria-current={item.href === current ? 'page' : undefined}
            className={clsx(
              'inline-flex h-11 items-center rounded-8 px-2 text-label whitespace-nowrap focus-visible:focus-ring desktop:px-3',
              item.href === current
                ? 'text-primary underline underline-offset-4'
                : 'text-text-secondary hover:underline',
            )}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  </nav>
)

/** buddy の画面の一覧。 */
export const SITE_NAV_ITEMS: readonly SiteNavItem[] = [
  { href: '/schedule', label: '予定' },
  { href: '/receipt', label: '照合' },
]
