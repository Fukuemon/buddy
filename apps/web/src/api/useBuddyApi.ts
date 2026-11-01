import { useRouteContext } from '@tanstack/react-router'

import type { BuddyApi } from './client'
import type { FacilityId, Viewer } from './types'

/**
 * router の context から、API と、ログインした職員と、その事業所を取り出す。
 *
 * ログインを求めない `/auth/` の下の画面で呼ぶと Error を投げる。
 */
export const useBuddyApi = (): { api: BuddyApi; facilityId: FacilityId; viewer: Viewer } => {
  const { api, viewer } = useRouteContext({ from: '__root__' })
  if (viewer === null) throw new Error('ログインした職員がいない画面で API を使った')
  return { api, facilityId: viewer.facilityId, viewer }
}
