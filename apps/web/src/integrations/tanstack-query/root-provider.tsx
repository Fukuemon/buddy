import { QueryClient } from '@tanstack/react-query'

import type { BuddyApi } from '#/api/client'
import { createBuddyApi } from '#/api/createBuddyApi'
import type { FacilityId } from '#/api/types'

/** route の loader と部品が共有する値。 */
export type AppRouterContext = {
  queryClient: QueryClient
  api: BuddyApi
  /** ログインした職員の事業所。ログインを入れるまでは環境変数か架空の事業所に固定する。 */
  facilityId: FacilityId
}

export function getContext(): AppRouterContext {
  return { queryClient: new QueryClient(), ...createBuddyApi(import.meta.env) }
}
