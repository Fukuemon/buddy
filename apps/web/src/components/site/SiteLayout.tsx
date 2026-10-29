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
  /**
   * サイドバーのリンクの下に置く、画面ごとの操作の欄を描く。
   * 幅 768px 未満では、ドロワーを閉じる関数を受ける。日付を選んだ後のように、操作の後にドロワーを閉じるときに呼ぶ。
   */
  renderSidebar?: (closeDrawer: (() => void) | undefined) => ReactNode
  children: ReactNode
}

/**
 * ヘッダー、左のサイドバー、画面の中身を並べる。サイドバーには、画面の間を移るリンクと、画面ごとの操作の欄を置く。
 * ヘッダーの左のメニューのボタンで、サイドバーを開閉する。
 * 幅 768px 以上では、サイドバーを開いた状態で始め、閉じると画面の中身を広げる。未満では、サイドバーをドロワーに入れ、閉じた状態で始める。
 * ドロワーを開いたまま 768px 以上になると、ドロワーを閉じる。
 */
export const SiteLayout = ({
  navItems,
  current,
  actions,
  renderSidebar,
  children,
}: SiteLayoutProps) => {
  const isDesktop = useIsDesktop()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const sidebarId = useId()
  if (isDesktop && isDrawerOpen) setIsDrawerOpen(false)

  const sidebar = (closeDrawer: (() => void) | undefined) => (
    <>
      <div className="p-2">
        <SiteNav current={current} items={navItems} />
      </div>
      {renderSidebar !== undefined && (
        <div className="border-t border-border">{renderSidebar(closeDrawer)}</div>
      )}
    </>
  )

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader
        menuButton={
          <button
            aria-controls={sidebarId}
            aria-expanded={isDesktop ? isSidebarOpen : isDrawerOpen}
            aria-label="メニュー"
            className="grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
            data-testid="site-nav-open"
            onClick={() => (isDesktop ? setIsSidebarOpen((open) => !open) : setIsDrawerOpen(true))}
            type="button"
          >
            <MenuIcon aria-hidden="true" height={24} width={24} />
          </button>
        }
        actions={actions}
      />
      <div className="flex min-h-0 grow">
        {isDesktop ? (
          isSidebarOpen && (
            <aside
              className="w-64 shrink-0 overflow-auto border-r border-border bg-surface"
              id={sidebarId}
            >
              {sidebar(undefined)}
            </aside>
          )
        ) : (
          <Drawer
            closeButtonTestId="site-nav-close"
            data-testid="site-nav-drawer"
            id={sidebarId}
            isOpen={isDrawerOpen}
            onCloseRequest={() => setIsDrawerOpen(false)}
            title="メニュー"
          >
            {sidebar(() => setIsDrawerOpen(false))}
          </Drawer>
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
