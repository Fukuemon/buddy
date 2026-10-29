import { clsx } from 'clsx'
import type { ComponentType, SVGProps } from 'react'

import ScheduleIcon from '#/assets/icons/calendar-month.svg?react'
import ReceiptIcon from '#/assets/icons/fact-check.svg?react'

/** 機能の中の画面のリンク。アイコンを付けず、機能のリンクの下に字下げして置く。 */
export type SiteNavLink = {
  /** testid の末尾。`site-nav-<id>` を付ける。 */
  id: string
  href: string
  label: string
}

/** 機能のリンク。 */
export type SiteNavItem = SiteNavLink & {
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** 機能の中の画面のリンク。 */
  children?: readonly SiteNavLink[]
}

export type SiteNavProps = {
  items: readonly SiteNavItem[]
  /** 今の画面の href。そのリンクに aria-current を付ける。 */
  current: string
}

const linkClassName = (isCurrent: boolean) =>
  clsx(
    'flex items-center rounded-8 px-4 focus-visible:focus-ring',
    isCurrent
      ? 'bg-primary-surface text-primary'
      : 'text-text-secondary hover:bg-surface-subtle hover:text-text',
  )

/** 画面の間を移るリンクの並び。今の画面のリンクは、面の色と aria-current で示す。 */
export const SiteNav = ({ items, current }: SiteNavProps) => (
  <nav aria-label="画面" data-testid="site-nav">
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <li key={item.href}>
            <a
              href={item.href}
              data-testid={`site-nav-${item.id}`}
              aria-current={item.href === current ? 'page' : undefined}
              className={clsx(linkClassName(item.href === current), 'h-12 gap-4 text-label')}
            >
              <Icon aria-hidden="true" className="shrink-0" height={24} width={24} />
              <span className="whitespace-nowrap">{item.label}</span>
            </a>
            {item.children !== undefined && item.children.length > 0 && (
              <ul className="mt-1 flex flex-col gap-1">
                {item.children.map((child) => (
                  <li key={child.href}>
                    <a
                      href={child.href}
                      data-testid={`site-nav-${child.id}`}
                      aria-current={child.href === current ? 'page' : undefined}
                      className={clsx(
                        linkClassName(child.href === current),
                        'h-10 pl-14 text-body',
                      )}
                    >
                      <span className="whitespace-nowrap">{child.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  </nav>
)

/** 職員の管理の権限を持つ職員にだけ出す、予定の取り込みのリンク。カレンダーの連携の画面も、このリンクを今の画面とする。 */
export const IMPORT_NAV_ITEM: SiteNavLink = {
  id: 'import',
  href: '/schedule/import',
  label: '取り込み',
}

/** 職員の管理の権限を持つ職員にだけ出す、確認が必要な予定（Google カレンダーと食い違った予定）のリンク。 */
export const REVIEW_NAV_ITEM: SiteNavLink = {
  id: 'review',
  href: '/schedule/review',
  label: '要確認',
}

const SCHEDULE_NAV_ITEM: SiteNavItem = {
  id: 'schedule',
  href: '/schedule',
  label: '予定',
  icon: ScheduleIcon,
}

const RECEIPT_NAV_ITEM: SiteNavItem = {
  id: 'receipt',
  href: '/receipt',
  label: '照合',
  icon: ReceiptIcon,
}

/** ログインした職員に出すリンクの並びを返す。職員の管理の権限を持つ職員には、予定の下に取り込みと要確認を足す。 */
export const siteNavItems = (canManageStaff: boolean): readonly SiteNavItem[] => [
  canManageStaff
    ? { ...SCHEDULE_NAV_ITEM, children: [IMPORT_NAV_ITEM, REVIEW_NAV_ITEM] }
    : SCHEDULE_NAV_ITEM,
  RECEIPT_NAV_ITEM,
]
