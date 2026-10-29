import { clsx } from 'clsx'
import { useId, type ComponentType, type SVGProps } from 'react'

import AppsIcon from '#/assets/icons/apps.svg?react'
import ScheduleIcon from '#/assets/icons/calendar-month.svg?react'
import ReceiptIcon from '#/assets/icons/fact-check.svg?react'

/** 画面の間を移るリンク。 */
export type SiteNavLink = {
  /** testid の末尾。`site-nav-<id>` を付ける。 */
  id: string
  href: string
  label: string
}

/** アプリのメニューに並べる機能。 */
export type SiteNavItem = SiteNavLink & {
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** 今の画面の href が、その機能の中にあるかを返す。 */
export const isInFeature = (item: SiteNavLink, current: string) =>
  current === item.href || current.startsWith(`${item.href}/`)

export type SiteNavProps = {
  items: readonly SiteNavItem[]
  /** 今の画面の href。その画面を含む機能に aria-current を付ける。 */
  current: string
}

/**
 * ヘッダーの右のアプリのボタンと、機能を切り替えるメニュー。押すと、機能のアイコンと名前を並べたメニューをボタンの下に開く。
 * メニューはブラウザの popover で、外を押すか Esc で閉じる。今の機能は、面の色と aria-current で示す。
 */
export const SiteNav = ({ items, current }: SiteNavProps) => {
  const menuId = useId()
  return (
    <>
      <button
        aria-label="アプリ"
        className="grid size-11 place-items-center rounded-full text-text-secondary hover:bg-surface-subtle focus-visible:focus-ring"
        data-testid="site-apps-open"
        popoverTarget={menuId}
        type="button"
      >
        <AppsIcon aria-hidden="true" height={24} width={24} />
      </button>
      {/* popover は最上層に出て既定で画面の中央に置かれるので、ヘッダーの右端の下へ置き直す */}
      <nav
        aria-label="画面"
        className="fixed inset-auto top-14 right-14 m-0 rounded-8 bg-surface p-4 shadow-3"
        data-testid="site-nav"
        id={menuId}
        popover="auto"
      >
        <ul className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const isCurrent = isInFeature(item, current)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <a
                  aria-current={isCurrent ? 'page' : undefined}
                  className={clsx(
                    'flex w-24 flex-col items-center gap-2 rounded-8 py-3 text-body focus-visible:focus-ring',
                    isCurrent
                      ? 'bg-primary-surface text-primary'
                      : 'text-text hover:bg-surface-subtle',
                  )}
                  data-testid={`site-nav-${item.id}`}
                  href={item.href}
                >
                  <Icon aria-hidden="true" height={32} width={32} />
                  <span>{item.label}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

/** 職員の管理の権限を持つ職員にだけ出す、予定の取り込みのボタンの移り先。カレンダーの連携の画面も、ここを今の画面とする。 */
export const IMPORT_NAV_ITEM: SiteNavLink = {
  id: 'import',
  href: '/schedule/import',
  label: '予定の取り込み',
}

/** 職員の管理の権限を持つ職員にだけ出す、確認が必要な予定（Google カレンダーと食い違った予定）のボタンの移り先。 */
export const REVIEW_NAV_ITEM: SiteNavLink = {
  id: 'review',
  href: '/schedule/review',
  label: '確認が必要な予定',
}

/** アプリのメニューに並べる機能。 */
export const SITE_NAV_ITEMS: readonly SiteNavItem[] = [
  { id: 'schedule', href: '/schedule', label: '予定', icon: ScheduleIcon },
  { id: 'receipt', href: '/receipt', label: '照合', icon: ReceiptIcon },
]
