import { QueryClient } from '@tanstack/react-query'

import type { BuddyApi } from '#/api/client'
import { FAKE_FACILITY_ID } from '#/api/fake/fixtures'
import { createFakeBuddyApi } from '#/api/fake/fakeBuddyApi'
import type { FacilityId } from '#/api/types'

/** route の loader と部品が共有する値。 */
export type AppRouterContext = {
  queryClient: QueryClient
  api: BuddyApi
  /** ログインした職員の事業所。ログインを入れるまでは架空の事業所に固定する。 */
  facilityId: FacilityId
}

export function getContext(): AppRouterContext {
  return {
    queryClient: new QueryClient(),
    api: createFakeBuddyApi(),
    facilityId: FAKE_FACILITY_ID,
  }
}
