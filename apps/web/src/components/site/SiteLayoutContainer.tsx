import { useRouteContext } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { SiteLayout } from './SiteLayout'
import { siteNavItems } from './SiteNav'
import { ViewerMenu } from './ViewerMenu'

export type SiteLayoutContainerProps = {
  /** 今の画面のリンクの href。 */
  current: string
  children: ReactNode
}

/**
 * ログインした職員の画面の枠。ヘッダーにログインした職員を、左端か左のドロワーに画面の間を移るリンクを置く。
 * 取り込みと要確認のリンクは、職員の管理の権限を持つ職員にだけ出す。
 */
export const SiteLayoutContainer = ({ current, children }: SiteLayoutContainerProps) => {
  const { viewer, mode } = useRouteContext({ from: '__root__' })
  return (
    <SiteLayout
      actions={
        viewer !== null && <ViewerMenu staffName={viewer.staffName} canLogout={mode === 'bff'} />
      }
      current={current}
      navItems={siteNavItems(viewer?.canManageStaff ?? false)}
    >
      {children}
    </SiteLayout>
  )
}
