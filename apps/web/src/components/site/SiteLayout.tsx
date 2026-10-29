import { Drawer } from '@buddy/ui'
import { useId, useState, type ReactNode } from 'react'

import MenuIcon from '#/assets/icons/menu.svg?react'

import { SiteHeader } from './SiteHeader'
import { SiteNav, isInFeature, type SiteNavItem } from './SiteNav'
import { useIsDesktop } from './useIsDesktop'

export type SiteLayoutProps = {
  /** アプリのメニューに並べる機能。今の画面を含む機能の名前を、ヘッダーに出す。 */
  navItems: readonly SiteNavItem[]
  /** 今の画面の href。 */
  current: string
  /** ヘッダーの右の、アプリのボタンより前に置く要素。取り込みと要確認のボタンを置く。 */
  tools?: ReactNode
  /** ヘッダーの右端に置く要素。アカウントのボタンを置く。 */
  account?: ReactNode
  /**
   * 左の欄に置く、画面の中の操作の欄を描く。渡した画面だけに、左の欄とメニューのボタンを出す。
   * 幅 768px 未満では、ドロワーを閉じる関数を受ける。日付を選んだ後のように、操作の後にドロワーを閉じるときに呼ぶ。
   */
  renderSidebar?: (closeDrawer: (() => void) | undefined) => ReactNode
  children: ReactNode
}

/**
 * ヘッダー、左の欄、画面の中身を並べる。ヘッダーには、今の機能の名前と、取り込み、要確認、アプリ、アカウントのボタンを置く。
 * 左の欄は、ヘッダーの左のメニューのボタンで開閉する。幅 768px 以上では開いた状態で始め、閉じると画面の中身を広げる。
 * 未満では、左の欄をドロワーに入れ、閉じた状態で始める。ドロワーを開いたまま 768px 以上になると、ドロワーを閉じる。
 */
export const SiteLayout = ({
  navItems,
  current,
  tools,
  account,
  renderSidebar,
  children,
}: SiteLayoutProps) => {
  const isDesktop = useIsDesktop()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const sidebarId = useId()
  if (isDesktop && isDrawerOpen) setIsDrawerOpen(false)

  const hasSidebar = renderSidebar !== undefined

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader
        actions={
          <>
            {tools}
            <SiteNav current={current} items={navItems} />
            {account}
          </>
        }
        menuButton={
          hasSidebar && (
            <button
              aria-controls={sidebarId}
              aria-expanded={isDesktop ? isSidebarOpen : isDrawerOpen}
              aria-label="日付と絞り込み"
              className="grid size-11 shrink-0 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
              data-testid="site-sidebar-open"
              onClick={() =>
                isDesktop ? setIsSidebarOpen((open) => !open) : setIsDrawerOpen(true)
              }
              type="button"
            >
              <MenuIcon aria-hidden="true" height={24} width={24} />
            </button>
          )
        }
        title={navItems.find((item) => isInFeature(item, current))?.label}
      />
      <div className="flex min-h-0 grow">
        {hasSidebar &&
          (isDesktop ? (
            isSidebarOpen && (
              <aside
                className="w-72 shrink-0 overflow-auto border-r border-border bg-surface"
                id={sidebarId}
              >
                {renderSidebar(undefined)}
              </aside>
            )
          ) : (
            <Drawer
              closeButtonTestId="site-sidebar-close"
              data-testid="site-sidebar-drawer"
              id={sidebarId}
              isOpen={isDrawerOpen}
              onCloseRequest={() => setIsDrawerOpen(false)}
              title="日付と絞り込み"
            >
              {renderSidebar(() => setIsDrawerOpen(false))}
            </Drawer>
          ))}
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
