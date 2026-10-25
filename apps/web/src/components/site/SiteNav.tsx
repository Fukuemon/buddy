import { clsx } from 'clsx'
import type { ComponentType, SVGProps } from 'react'

import ScheduleIcon from '#/assets/icons/calendar-month.svg?react'
import ImportIcon from '#/assets/icons/download.svg?react'
import ReviewIcon from '#/assets/icons/error.svg?react'
import ReceiptIcon from '#/assets/icons/fact-check.svg?react'

/** 並びの 1 つのリンク。 */
export type SiteNavItem = {
  /** testid の末尾。`site-nav-<id>` を付ける。 */
  id: string
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export type SiteNavProps = {
  items: readonly SiteNavItem[]
  /** 今の画面の href。そのリンクに aria-current を付ける。 */
  current: string
  /** rail は幅 768px 以上の左端の縦の並びで、アイコンの下に名前を置く。list はドロワーの中の並びで、アイコンの右に名前を置く。 */
  layout: 'rail' | 'list'
}

/** 画面の間を移るリンクの並び。今の画面のリンクは、面の色と aria-current で示す。 */
export const SiteNav = ({ items, current, layout }: SiteNavProps) => (
  <nav aria-label="画面" data-testid="site-nav">
    <ul className={clsx('flex flex-col', layout === 'rail' ? 'gap-2' : 'gap-1')}>
      {items.map((item) => {
        const isCurrent = item.href === current
        const Icon = item.icon
        return (
          <li key={item.href}>
            <a
              href={item.href}
              data-testid={`site-nav-${item.id}`}
              aria-current={isCurrent ? 'page' : undefined}
              className={clsx(
                'flex rounded-8 focus-visible:focus-ring',
                layout === 'rail'
                  ? 'w-18 flex-col items-center gap-1 py-2 text-body-dense'
                  : 'h-12 items-center gap-4 px-4 text-body-dense',
                isCurrent
                  ? 'bg-primary-surface font-bold text-primary'
                  : 'text-text-secondary hover:bg-surface-subtle hover:text-text',
              )}
            >
              <Icon aria-hidden="true" className="shrink-0" height={24} width={24} />
              <span className="whitespace-nowrap">{item.label}</span>
            </a>
          </li>
        )
      })}
    </ul>
  </nav>
)

/** buddy の画面の一覧。 */
export const SITE_NAV_ITEMS: readonly SiteNavItem[] = [
  { id: 'schedule', href: '/schedule', label: '予定', icon: ScheduleIcon },
  { id: 'receipt', href: '/receipt', label: '照合', icon: ReceiptIcon },
]

/** 職員の管理の権限を持つ職員にだけ出す、予定の取り込みのリンク。カレンダーの連携の画面も、このリンクを今の画面とする。 */
export const IMPORT_NAV_ITEM: SiteNavItem = {
  id: 'import',
  href: '/schedule/import',
  label: '取り込み',
  icon: ImportIcon,
}

/** 職員の管理の権限を持つ職員にだけ出す、確認が必要な予定（Google カレンダーと食い違った予定）のリンク。 */
export const REVIEW_NAV_ITEM: SiteNavItem = {
  id: 'review',
  href: '/schedule/review',
  label: '要確認',
  icon: ReviewIcon,
}

/** ログインした職員に出すリンクの並びを返す。職員の管理の権限を持つ職員には、取り込みと要確認を足す。 */
export const siteNavItems = (canManageStaff: boolean): readonly SiteNavItem[] =>
  canManageStaff ? [...SITE_NAV_ITEMS, IMPORT_NAV_ITEM, REVIEW_NAV_ITEM] : SITE_NAV_ITEMS
