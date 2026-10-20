import { useRouteContext } from '@tanstack/react-router'

import type { BuddyApi } from './client'
import type { FacilityId } from './types'

/**
 * router の context から、API とログインした職員の事業所を取り出す。
 *
 * ログインを求めない `/auth/` の下の画面で呼ぶと Error を投げる。
 */
export const useBuddyApi = (): { api: BuddyApi; facilityId: FacilityId } => {
  const { api, viewer } = useRouteContext({ from: '__root__' })
  if (viewer === null) throw new Error('ログインした職員がいない画面で API を使った')
  return { api, facilityId: viewer.facilityId }
}
