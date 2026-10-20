import type { BuddyApi } from './client'
import { FAKE_FACILITY_ID } from './fake/fixtures'
import { createFakeBuddyApi } from './fake/fakeBuddyApi'
import { createHttpBuddyApi } from './http/httpBuddyApi'
import type { FacilityId } from './types'

/** createBuddyApi が読む環境変数。意味は README の「API を切り替える」にある。 */
export type ApiEnv = {
  VITE_API_MODE?: string
  VITE_SCHEDULE_API_URL?: string
  VITE_FACILITY_ID?: string
}

const DEFAULT_SCHEDULE_API_URL = 'http://localhost:8080'

/**
 * VITE_API_MODE が http なら予定の API を呼ぶ BuddyApi を、fake か未指定なら偽物の BuddyApi を作る。
 *
 * http で VITE_FACILITY_ID が無いとき、VITE_API_MODE がほかの値のときは Error を投げる。
 */
export const createBuddyApi = (env: ApiEnv): { api: BuddyApi; facilityId: FacilityId } => {
  const mode = env.VITE_API_MODE || 'fake'
  if (mode === 'fake') return { api: createFakeBuddyApi(), facilityId: FAKE_FACILITY_ID }
  if (mode !== 'http') throw new Error(`VITE_API_MODE は fake か http にする: ${mode}`)
  if (!env.VITE_FACILITY_ID)
    throw new Error('VITE_API_MODE が http のときは VITE_FACILITY_ID を渡す')
  return {
    api: createHttpBuddyApi({ baseUrl: env.VITE_SCHEDULE_API_URL || DEFAULT_SCHEDULE_API_URL }),
    facilityId: env.VITE_FACILITY_ID,
  }
}
