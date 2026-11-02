import { QueryClient } from '@tanstack/react-query'

import { ApiError, type BuddyApi, type ReceiptApi } from '#/api/BuddyApi'
import { createBuddyApi, type ApiMode } from '#/api/createBuddyApi'

/** route の loader と部品が共有する値。ログインした職員は、root の route の beforeLoad が足す。 */
export type AppRouterContext = {
  queryClient: QueryClient
  api: BuddyApi
  receiptApi: ReceiptApi
  mode: ApiMode
}

/** 取得を取り直す回数の上限。TanStack Query の既定と同じにする。 */
const MAX_RETRIES = 3

/**
 * 失敗した取得を取り直すか。4xx は取り直しても同じ結果になるので、すぐに失敗の表示にする。
 * 規則は docs/screens/rules.md の「エラーの見せ方」にある。
 */
export const shouldRetryQuery = (failureCount: number, error: Error) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
  failureCount < MAX_RETRIES

/**
 * route の context を作る。呼ぶたびに新しい QueryClient を作る。
 * API は環境変数の VITE_API_MODE で選び、fake と bff 以外の値なら Error を投げる。
 */
export function getContext(): AppRouterContext {
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } }),
    ...createBuddyApi(import.meta.env),
  }
}
