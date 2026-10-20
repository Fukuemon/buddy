import { useRouteContext } from '@tanstack/react-router'

import { SITE_NAV_ITEMS, SiteNav } from './SiteNav'
import { SiteHeader } from './SiteHeader'
import { ViewerMenu } from './ViewerMenu'

export type SiteHeaderContainerProps = {
  /** 今の画面の SITE_NAV_ITEMS の href。 */
  current: string
}

/** ログインした職員と画面の間のリンクを持つヘッダー。 */
export const SiteHeaderContainer = ({ current }: SiteHeaderContainerProps) => {
  const { viewer, mode } = useRouteContext({ from: '__root__' })
  return (
    <SiteHeader
      nav={<SiteNav items={SITE_NAV_ITEMS} current={current} />}
      actions={
        viewer !== null && <ViewerMenu staffName={viewer.staffName} canLogout={mode === 'bff'} />
      }
    />
  )
}
