import { Drawer } from '@buddy/ui'
import { useId, useState, type ReactNode } from 'react'

import MenuIcon from '#/assets/icons/menu.svg?react'

import { SiteHeader } from './SiteHeader'
import { SiteNav, type SiteNavItem } from './SiteNav'
import { useIsDesktop } from './useIsDesktop'

export type SiteLayoutProps = {
  /** 画面の間を移るリンク。 */
  navItems: readonly SiteNavItem[]
  /** 今の画面のリンクの href。 */
  current: string
  /** ヘッダーの右端に置く要素。 */
  actions?: ReactNode
  children: ReactNode
}

/**
 * ヘッダー、画面の間を移るリンク、画面の中身を並べる。
 * 幅 768px 以上では、リンクを左端の縦の並びに常に出す。未満では、ヘッダーの左のボタンで開くドロワーに入れ、閉じた状態で始める。
 * ドロワーを開いたまま 768px 以上になると、ドロワーを閉じる。
 */
export const SiteLayout = ({ navItems, current, actions, children }: SiteLayoutProps) => {
  const isDesktop = useIsDesktop()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const drawerId = useId()
  if (isDesktop && isDrawerOpen) setIsDrawerOpen(false)

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader
        menuButton={
          !isDesktop && (
            <button
              aria-controls={drawerId}
              aria-expanded={isDrawerOpen}
              aria-label="メニュー"
              className="grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
              data-testid="site-nav-open"
              onClick={() => setIsDrawerOpen(true)}
              type="button"
            >
              <MenuIcon aria-hidden="true" height={24} width={24} />
            </button>
          )
        }
        actions={actions}
      />
      <div className="flex min-h-0 grow">
        {isDesktop ? (
          <aside className="shrink-0 overflow-auto border-r border-border bg-surface p-2">
            <SiteNav current={current} items={navItems} layout="rail" />
          </aside>
        ) : (
          <Drawer
            closeButtonTestId="site-nav-close"
            data-testid="site-nav-drawer"
            id={drawerId}
            isOpen={isDrawerOpen}
            onCloseRequest={() => setIsDrawerOpen(false)}
            title="メニュー"
          >
            <div className="p-2">
              <SiteNav current={current} items={navItems} layout="list" />
            </div>
          </Drawer>
        )}
        <div className="flex min-h-0 min-w-0 grow flex-col overflow-auto">{children}</div>
      </div>
    </div>
  )
}
