import { QueryClient } from '@tanstack/react-query'

import type { BuddyApi } from '#/api/client'
import { createBuddyApi, type ApiMode } from '#/api/createBuddyApi'

/** route の loader と部品が共有する値。ログインした職員は、root の route の beforeLoad が足す。 */
export type AppRouterContext = {
  queryClient: QueryClient
  api: BuddyApi
  mode: ApiMode
}

export function getContext(): AppRouterContext {
  return { queryClient: new QueryClient(), ...createBuddyApi(import.meta.env) }
}
