import { QueryClient } from '@tanstack/react-query'

import { ApiError, type BuddyApi, type ReceiptApi } from '#/api/BuddyApi'
import { createBuddyApi, type ApiMode } from '#/api/createBuddyApi'
import { isSessionUnavailable, SESSION_UNAVAILABLE_CODE } from '#/api/sessionUnavailable'
import type { Viewer } from '#/api/types'

/** route の loader と部品が共有する値。ログインした職員は、root の route の beforeLoad が足す。 */
export type AppRouterContext = {
  queryClient: QueryClient
  api: BuddyApi
  receiptApi: ReceiptApi
  mode: ApiMode
  /** ログインした職員を読む。ログインしていなければ null を返す。Viewer の query の queryFn になる。 */
  getViewer: () => Promise<Viewer | null>
}

/** 取得を取り直す回数の上限。TanStack Query の既定と同じにする。 */
const MAX_RETRIES = 3

/**
 * 失敗した取得を取り直すか。4xx は取り直しても同じ結果になるので、すぐに失敗の表示にする。
 * ログインの期限を延ばせなかった失敗も取り直さない。1 回の表示で refresh を 1 度だけ試すためである（ADR-0044）。
 * 規則は docs/screens/rules.md の「エラーの見せ方」にある。
 */
export const shouldRetryQuery = (failureCount: number, error: Error) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
  !(error instanceof ApiError && error.code === SESSION_UNAVAILABLE_CODE) &&
  !isSessionUnavailable(error) &&
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
