import { QueryClient } from '@tanstack/react-query'

import type { BuddyApi, ReceiptApi } from '#/api/client'
import { createBuddyApi, type ApiMode } from '#/api/createBuddyApi'

/** route の loader と部品が共有する値。ログインした職員は、root の route の beforeLoad が足す。 */
export type AppRouterContext = {
  queryClient: QueryClient
  api: BuddyApi
  receiptApi: ReceiptApi
  mode: ApiMode
}

/** route の context を作る。API は環境変数の VITE_API_MODE で選ぶ。 */
export function getContext(): AppRouterContext {
  return { queryClient: new QueryClient(), ...createBuddyApi(import.meta.env) }
}
