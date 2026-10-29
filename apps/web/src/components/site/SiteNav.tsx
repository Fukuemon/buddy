import { clsx } from 'clsx'

/** 画面の間を移るリンク。 */
export type SiteNavLink = {
  /** testid の末尾。`site-nav-<id>` を付ける。 */
  id: string
  href: string
  label: string
}

/** 機能のタブ。 */
export type SiteNavItem = SiteNavLink & {
  /** 機能の中のタブ。渡したときだけ、機能の画面の中身の上端に出す。 */
  children?: readonly SiteNavLink[]
}

/** 今の画面の href が、その機能のタブの中にあるかを返す。 */
export const isInFeature = (item: SiteNavItem, current: string) =>
  current === item.href ||
  current.startsWith(`${item.href}/`) ||
  (item.children ?? []).some((child) => child.href === current)

/** タブのリンクのクラス。今の画面のタブに下線を引く。機能のタブと機能の中のタブで共有する。 */
export const tabClassName = (isCurrent: boolean) =>
  clsx(
    'flex items-center border-b-3 px-3 whitespace-nowrap focus-visible:focus-ring',
    isCurrent
      ? 'border-primary text-primary'
      : 'border-transparent text-text-secondary hover:text-text',
  )

export type SiteNavProps = {
  items: readonly SiteNavItem[]
  /** 今の画面の href。その画面を含む機能のタブに aria-current を付ける。 */
  current: string
}

/** ヘッダーの機能のタブ。今の機能のタブは、下線と aria-current で示す。 */
export const SiteNav = ({ items, current }: SiteNavProps) => (
  <nav aria-label="画面" className="flex self-stretch" data-testid="site-nav">
    <ul className="flex gap-1">
      {items.map((item) => {
        const isCurrent = isInFeature(item, current)
        return (
          <li className="flex" key={item.href}>
            <a
              aria-current={isCurrent ? 'page' : undefined}
              className={clsx(tabClassName(isCurrent), 'text-label')}
              data-testid={`site-nav-${item.id}`}
              href={item.href}
            >
              {item.label}
            </a>
          </li>
        )
      })}
    </ul>
  </nav>
)

/** 予定のカレンダーのタブ。 */
export const CALENDAR_NAV_ITEM: SiteNavLink = {
  id: 'calendar',
  href: '/schedule',
  label: 'カレンダー',
}

/** 職員の管理の権限を持つ職員にだけ出す、予定の取り込みのタブ。カレンダーの連携の画面も、このタブを今の画面とする。 */
export const IMPORT_NAV_ITEM: SiteNavLink = {
  id: 'import',
  href: '/schedule/import',
  label: '取り込み',
}

/** 職員の管理の権限を持つ職員にだけ出す、確認が必要な予定（Google カレンダーと食い違った予定）のタブ。 */
export const REVIEW_NAV_ITEM: SiteNavLink = {
  id: 'review',
  href: '/schedule/review',
  label: '要確認',
}

/** ログインした職員に出す機能のタブを返す。職員の管理の権限を持つ職員には、予定の中にカレンダー、取り込み、要確認のタブを足す。 */
export const siteNavItems = (canManageStaff: boolean): readonly SiteNavItem[] => [
  {
    id: 'schedule',
    href: '/schedule',
    label: '予定',
    children: canManageStaff ? [CALENDAR_NAV_ITEM, IMPORT_NAV_ITEM, REVIEW_NAV_ITEM] : undefined,
  },
  { id: 'receipt', href: '/receipt', label: '照合' },
]
