import { useRouteContext } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { SiteLayout, type SiteLayoutProps } from './SiteLayout'
import { SITE_NAV_ITEMS } from './SiteNav'
import { ViewerMenu } from './ViewerMenu'

export type SiteLayoutContainerProps = {
  /** 今の画面の href。 */
  current: string
  tools?: SiteLayoutProps['tools']
  renderSidebar?: SiteLayoutProps['renderSidebar']
  children: ReactNode
}

/** ログインした職員の画面の枠。ヘッダーの右端に、ログインした職員のアカウントのボタンを置く。 */
export const SiteLayoutContainer = ({
  current,
  tools,
  renderSidebar,
  children,
}: SiteLayoutContainerProps) => {
  const { viewer, mode } = useRouteContext({ from: '__root__' })
  return (
    <SiteLayout
      account={
        viewer !== null && <ViewerMenu staffName={viewer.staffName} canLogout={mode === 'bff'} />
      }
      current={current}
      navItems={SITE_NAV_ITEMS}
      renderSidebar={renderSidebar}
      tools={tools}
    >
      {children}
    </SiteLayout>
  )
}
