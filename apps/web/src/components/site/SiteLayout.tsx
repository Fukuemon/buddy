import { Drawer } from '@buddy/ui'
import { useId, useState, type ReactNode } from 'react'

import MenuIcon from '#/assets/icons/menu.svg?react'

import { SiteHeader } from './SiteHeader'
import { SiteNav, type SiteNavGroup } from './SiteNav'
import { useIsDesktop } from './useIsDesktop'

export type SiteLayoutProps = {
  /** ナビゲーションに並べる画面。 */
  navGroups: readonly SiteNavGroup[]
  /** 今の画面の href。 */
  current: string
  /** 項目の id ごとに、ナビゲーションの名前の右に置く印。 */
  navBadges?: Partial<Record<string, ReactNode>>
  /** true なら、幅 768px 以上で、ナビゲーションをたたんだレールで始める。予定のカレンダーで渡す。 */
  startsWithRail?: boolean
  /** ヘッダーの右端に置く要素。アカウントのボタンを置く。 */
  account?: ReactNode
  /** 幅 768px 以上で、ナビゲーションと画面の中身の間に置く欄。予定のカレンダーの日付と絞り込みを置く。 */
  sidebar?: ReactNode
  children: ReactNode
}

/**
 * ヘッダー、ナビゲーション、画面の中身を並べる。ヘッダーの左のメニューのボタンで、ナビゲーションを開閉する。
 * 幅 768px 以上では、ナビゲーションを開いた形とレールで切り替える。
 * 未満では、ナビゲーションをドロワーに入れ、閉じた状態で始める。ドロワーを開いたまま 768px 以上になると、ドロワーを閉じる。
 */
export const SiteLayout = ({
  navGroups,
  current,
  navBadges,
  startsWithRail = false,
  account,
  sidebar,
  children,
}: SiteLayoutProps) => {
  const isDesktop = useIsDesktop()
  const [isRail, setIsRail] = useState(startsWithRail)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const navId = useId()
  if (isDesktop && isDrawerOpen) setIsDrawerOpen(false)

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader
        actions={account}
        menuButton={
          <button
            aria-controls={navId}
            aria-expanded={isDesktop ? !isRail : isDrawerOpen}
            aria-label="メニュー"
            className="grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
            data-testid="site-nav-toggle"
            onClick={() => (isDesktop ? setIsRail((rail) => !rail) : setIsDrawerOpen(true))}
            type="button"
          >
            <MenuIcon aria-hidden="true" height={24} width={24} />
          </button>
        }
      />
      <div className="flex min-h-0 grow">
        {isDesktop ? (
          <aside
            className={`shrink-0 overflow-auto border-r border-border bg-surface ${isRail ? 'w-20' : 'w-56'}`}
          >
            <SiteNav
              badges={navBadges}
              current={current}
              groups={navGroups}
              id={navId}
              isRail={isRail}
            />
          </aside>
        ) : (
          <Drawer
            closeButtonTestId="site-nav-close"
            id={navId}
            isOpen={isDrawerOpen}
            onCloseRequest={() => setIsDrawerOpen(false)}
            title="buddy"
          >
            <SiteNav badges={navBadges} current={current} groups={navGroups} />
          </Drawer>
        )}
        {isDesktop && sidebar !== undefined && (
          <aside className="w-72 shrink-0 overflow-auto border-r border-border bg-surface">
            {sidebar}
          </aside>
        )}
        <div
          className="flex min-h-0 min-w-0 grow flex-col overflow-auto"
          data-scroll-restoration-id="site-main"
        >
          {children}
        </div>
      </div>
    </div>
  )
}
