import { clsx } from 'clsx'
import { useId, type ComponentType, type ReactNode, type SVGProps } from 'react'

import type { Viewer } from '#/api/types'

import ScheduleIcon from '#/assets/icons/calendar-month.svg?react'
import ImportIcon from '#/assets/icons/download.svg?react'
import StaffIcon from '#/assets/icons/group.svg?react'
import OrganizationIcon from '#/assets/icons/account-tree.svg?react'
import PatientIcon from '#/assets/icons/patient.svg?react'
import ReceiptIcon from '#/assets/icons/fact-check.svg?react'
import LinkIcon from '#/assets/icons/link.svg?react'
import ReviewIcon from '#/assets/icons/notifications.svg?react'

/** ナビゲーションに並べる画面。 */
export type SiteNavItem = {
  /** testid の末尾。`site-nav-<id>` を付ける。 */
  id: string
  href: string
  label: string
  /**
   * レールでだけ出す、5 文字以内の短い名前。label が 6 文字以上で、レールの幅に収まらない項目にだけ付ける。
   * 読み上げる名前は、見える短い名前の後に、括弧で正式な名前を続けたものになる。
   */
  railLabel?: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** 機能の名前を見出しにした、画面のまとまり。 */
export type SiteNavGroup = {
  label: string
  items: readonly SiteNavItem[]
}

/**
 * href が今の画面と同じ項目の id を返す。
 * 権限が無くて出していない画面（`/schedule/review` など）では、どの項目も選ばない。親のカレンダー（`/schedule`）を選ぶと、今の画面を取り違えて読み上げる。
 */
const findCurrentItemId = (groups: readonly SiteNavGroup[], current: string) =>
  groups.flatMap((group) => group.items).find((item) => item.href === current)?.id

export type SiteNavProps = {
  groups: readonly SiteNavGroup[]
  /** 今の画面の href。その画面の項目に aria-current を付ける。 */
  current: string
  /** true なら、見出しを出さず、アイコンの下に名前を置いた細い列（レール）で描く。 */
  isRail?: boolean
  /** 項目の id ごとに、名前の右に置く印。要確認の件数を置く。 */
  badges?: Partial<Record<string, ReactNode>>
  id?: string
}

/**
 * 画面の間を移るナビゲーション。機能の名前を見出しにして、その下に画面のアイコンと名前を並べる。
 * 今の画面は、面の色と aria-current で示す。レールでは、見出しを読み上げにだけ残し、機能の間を区切り線で分ける。
 */
export const SiteNav = ({ groups, current, isRail = false, badges = {}, id }: SiteNavProps) => {
  const headingIdPrefix = useId()
  const currentId = findCurrentItemId(groups, current)
  return (
    <nav
      aria-label="画面"
      className={clsx('flex flex-col', isRail ? 'gap-2 px-0.5 py-3' : 'gap-4 p-3')}
      data-testid="site-nav"
      id={id}
    >
      {groups.map((group, index) => {
        const headingId = `${headingIdPrefix}-${index}`
        return (
          <div
            className={clsx(
              'flex flex-col gap-0.5',
              isRail && index > 0 && 'border-t border-border pt-2',
            )}
            key={group.label}
          >
            <span
              className={
                isRail ? 'sr-only' : 'px-3 py-1 text-caption font-bold text-text-secondary'
              }
              id={headingId}
            >
              {group.label}
            </span>
            <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isCurrent = item.id === currentId
                const Icon = item.icon
                const badge = badges[item.id]
                return (
                  <li key={item.id}>
                    <a
                      aria-current={isCurrent ? 'page' : undefined}
                      className={clsx(
                        'relative flex items-center focus-visible:focus-ring',
                        isRail
                          ? 'flex-col gap-1 rounded-8 py-1.5 text-caption'
                          : 'h-10 gap-3 rounded-full px-3 text-body',
                        isCurrent
                          ? 'bg-primary-surface font-bold text-primary'
                          : 'text-text hover:bg-surface-subtle',
                      )}
                      data-testid={`site-nav-${item.id}`}
                      href={item.href}
                    >
                      <Icon aria-hidden="true" className="shrink-0" height={24} width={24} />
                      {isRail && item.railLabel !== undefined ? (
                        <span className="whitespace-nowrap">
                          {item.railLabel}
                          {/* 見える名前を読み上げる名前の先頭に残し、音声で操作する人が見える名前で指せるようにする（WCAG 2.5.3） */}
                          <span className="sr-only">（{item.label}）</span>
                        </span>
                      ) : (
                        <span className={isRail ? 'whitespace-nowrap' : 'grow'}>{item.label}</span>
                      )}
                      {badge !== undefined && (
                        <span className={clsx(isRail && 'absolute top-0.5 right-3.5')}>
                          {badge}
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

const SCHEDULE_ITEM: SiteNavItem = {
  id: 'schedule',
  href: '/schedule',
  label: 'カレンダー',
  icon: ScheduleIcon,
}

/** 職員の管理の権限を持つ職員にだけ出す、予定の中の画面。 */
const SCHEDULE_MANAGER_ITEMS: readonly SiteNavItem[] = [
  { id: 'import', href: '/schedule/import', label: '取り込み', icon: ImportIcon },
  { id: 'review', href: '/schedule/review', label: '要確認', icon: ReviewIcon },
  { id: 'link', href: '/schedule/link', label: '連携', icon: LinkIcon },
]

/** 職員の管理の権限を持つ職員にだけ出す、利用者の画面。 */
const PATIENT_GROUP: SiteNavGroup = {
  label: '利用者',
  items: [{ id: 'patient', href: '/patients', label: '利用者', icon: PatientIcon }],
}

const RECEIPT_GROUP: SiteNavGroup = {
  label: '照合',
  items: [{ id: 'receipt', href: '/receipt', label: '照合', icon: ReceiptIcon }],
}

/** 職員の管理の権限を持つ職員にだけ出す、職員と部署とチームの画面。 */
const STAFF_GROUP: SiteNavGroup = {
  label: '職員',
  items: [
    { id: 'staff', href: '/staff', label: '職員', icon: StaffIcon },
    {
      id: 'organization',
      href: '/organization',
      label: '部署とチーム',
      // 業務の語の定義で、部署とチームは職員の「所属」である。「組織」は ID ブローカーの組織を指すので使わない
      railLabel: '所属',
      icon: OrganizationIcon,
    },
  ],
}

/**
 * ナビゲーションに並べる画面。取り込み、要確認、連携と職員と利用者は職員の管理の権限を持つ職員にだけ、
 * 照合は照合の権限を持つ職員にだけ出す。
 */
export const siteNavGroups = ({
  canManageStaff,
  canCheckReceipt,
}: Pick<Viewer, 'canManageStaff' | 'canCheckReceipt'>): readonly SiteNavGroup[] => [
  {
    label: '予定',
    items: canManageStaff ? [SCHEDULE_ITEM, ...SCHEDULE_MANAGER_ITEMS] : [SCHEDULE_ITEM],
  },
  ...(canCheckReceipt ? [RECEIPT_GROUP] : []),
  ...(canManageStaff ? [STAFF_GROUP, PATIENT_GROUP] : []),
]
