import { createBffBuddyApi } from './bff/bffBuddyApi'
import { createBffReceiptApi } from './bff/bffReceiptApi'
import type { BuddyApi, ReceiptApi } from './client'
import { createFakeBuddyApi } from './fake/fakeBuddyApi'
import { createFakeReceiptApi } from './fake/fakeReceiptApi'

/** createBuddyApi が読む環境変数。意味は README の Configuration にある。 */
export type ApiEnv = {
  VITE_API_MODE?: string
}

/** fake はローカルのフェイクの API、bff はサーバーのセッションで予定の API を呼ぶ。 */
export type ApiMode = 'fake' | 'bff'

/**
 * VITE_API_MODE が bff なら BFF を通す BuddyApi と ReceiptApi を、fake か未指定ならフェイクを作る。
 *
 * VITE_API_MODE がほかの値のときは Error を投げる。
 */
export const createBuddyApi = (
  env: ApiEnv,
): { api: BuddyApi; receiptApi: ReceiptApi; mode: ApiMode } => {
  const mode = env.VITE_API_MODE || 'fake'
  if (mode === 'fake')
    return { api: createFakeBuddyApi(), receiptApi: createFakeReceiptApi(), mode }
  if (mode === 'bff') return { api: createBffBuddyApi(), receiptApi: createBffReceiptApi(), mode }
  throw new Error(`VITE_API_MODE は fake か bff にする: ${mode}`)
}
