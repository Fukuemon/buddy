import { useRouteContext } from '@tanstack/react-router'

import { SiteNav, siteNavItems } from './SiteNav'
import { SiteHeader } from './SiteHeader'
import { ViewerMenu } from './ViewerMenu'

export type SiteHeaderContainerProps = {
  /** 今の画面のリンクの href。 */
  current: string
}

/** ログインした職員と画面の間のリンクを持つヘッダー。取り込みのリンクは、職員の管理の権限を持つ職員にだけ出す。 */
export const SiteHeaderContainer = ({ current }: SiteHeaderContainerProps) => {
  const { viewer, mode } = useRouteContext({ from: '__root__' })
  return (
    <SiteHeader
      nav={<SiteNav items={siteNavItems(viewer?.canManageStaff ?? false)} current={current} />}
      actions={
        viewer !== null && <ViewerMenu staffName={viewer.staffName} canLogout={mode === 'bff'} />
      }
    />
  )
}
