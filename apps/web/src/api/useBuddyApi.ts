import { useRouteContext } from '@tanstack/react-router'

import type { BuddyApi } from './client'
import type { FacilityId } from './types'

/** router の context から、API とログインした職員の事業所を取り出す。 */
export const useBuddyApi = (): { api: BuddyApi; facilityId: FacilityId } => {
  const { api, facilityId } = useRouteContext({ from: '__root__' })
  return { api, facilityId }
}
