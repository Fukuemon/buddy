import { useRouteContext } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { useViewer } from '#/api/viewer'

import { SiteLayout, type SiteLayoutProps } from './SiteLayout'
import { siteNavGroups } from './SiteNav'
import { ViewerMenu } from './ViewerMenu'

export type SiteLayoutContainerProps = {
  /** 今の画面の href。 */
  current: string
  /** ナビゲーションの要確認の名前の右に置く、確認が必要な予定の件数の印。 */
  reviewBadge?: ReactNode
  startsWithRail?: SiteLayoutProps['startsWithRail']
  sidebar?: SiteLayoutProps['sidebar']
  isSidebarOpen?: SiteLayoutProps['isSidebarOpen']
  children: ReactNode
}

/**
 * ログインした職員の画面の枠。職員の管理の権限と照合の権限で、ナビゲーションに並べる画面を決める。
 * ヘッダーの右端に、ログインした職員のアカウントのボタンを置く。
 */
export const SiteLayoutContainer = ({
  current,
  reviewBadge,
  startsWithRail,
  sidebar,
  isSidebarOpen,
  children,
}: SiteLayoutContainerProps) => {
  const { mode } = useRouteContext({ from: '__root__' })
  const viewer = useViewer()
  return (
    <SiteLayout
      account={
        viewer !== null && <ViewerMenu staffName={viewer.staffName} canLogout={mode === 'bff'} />
      }
      current={current}
      navBadges={{ review: reviewBadge }}
      navGroups={siteNavGroups(viewer)}
      isSidebarOpen={isSidebarOpen}
      sidebar={sidebar}
      startsWithRail={startsWithRail}
    >
      {children}
    </SiteLayout>
  )
}
