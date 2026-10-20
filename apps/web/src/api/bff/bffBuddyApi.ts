import { ApiError, type BuddyApi } from '../client'
import { loginHref } from '../viewer'
import type { BffOperation, BffResult } from './bffCall'
import { callBffFn } from './serverFns'

type CallBff = (call: { op: BffOperation; args: unknown[] }) => Promise<BffResult>

/**
 * BFF の server function を呼ぶ BuddyApi を作る。トークンはサーバーのセッションにあり、ブラウザは持たない。
 *
 * 失敗は status つきの ApiError で投げる。ブラウザで 401 を受けたら、今の画面に戻るログインへ移る。
 */
export const createBffBuddyApi = (callBff: CallBff = (data) => callBffFn({ data })): BuddyApi => {
  const call =
    (op: BffOperation) =>
    async (...args: unknown[]): Promise<never> => {
      const result = await callBff({ op, args })
      if (result.ok) return result.data as never
      if (result.status === 401 && typeof window !== 'undefined') {
        window.location.assign(loginHref(window.location.pathname + window.location.search))
        // 画面が移るまでの間に、呼び出し元がエラーの表示を出さないよう、終わらない Promise を返す
        return new Promise<never>(() => {})
      }
      throw new ApiError(result.status, result.message)
    }
  return {
    schedules: {
      list: call('schedules.list'),
      get: call('schedules.get'),
      create: call('schedules.create'),
      update: call('schedules.update'),
    },
    staff: { list: call('staff.list') },
    teams: { list: call('teams.list') },
    patients: { list: call('patients.list') },
  }
}
