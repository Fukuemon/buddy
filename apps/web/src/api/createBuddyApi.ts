import { createBffBuddyApi } from './bff/bffBuddyApi'
import type { BuddyApi } from './client'
import { createFakeBuddyApi } from './fake/fakeBuddyApi'

/** createBuddyApi が読む環境変数。意味は README の「API を切り替える」にある。 */
export type ApiEnv = {
  VITE_API_MODE?: string
}

/** fake は手元の偽物の API、bff はサーバーのセッションで予定の API を呼ぶ。 */
export type ApiMode = 'fake' | 'bff'

/**
 * VITE_API_MODE が bff なら BFF を通す BuddyApi を、fake か未指定なら偽物の BuddyApi を作る。
 *
 * VITE_API_MODE がほかの値のときは Error を投げる。
 */
export const createBuddyApi = (env: ApiEnv): { api: BuddyApi; mode: ApiMode } => {
  const mode = env.VITE_API_MODE || 'fake'
  if (mode === 'fake') return { api: createFakeBuddyApi(), mode }
  if (mode === 'bff') return { api: createBffBuddyApi(), mode }
  throw new Error(`VITE_API_MODE は fake か bff にする: ${mode}`)
}
