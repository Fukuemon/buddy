import { ApiError, type BuddyApi } from '../BuddyApi'
import { redirectToLogin } from '../viewer'
import type { BffCall, BffMethod, BffOperation, BffResult } from './bffCall'
import { callBffFn } from './serverFns'

type CallBff = (call: BffCall) => Promise<BffResult>

/**
 * BFF の server function を呼ぶ BuddyApi を作る。トークンはサーバーのセッションにあり、ブラウザは持たない。
 *
 * 失敗は status つきの ApiError で投げる。ブラウザで 401 を受けたら、今の画面に戻るログインへ移る。
 */
export const createBffBuddyApi = (callBff: CallBff = (data) => callBffFn({ data })): BuddyApi => {
  // 返す型を操作の名前から引くので、対応を別の操作の名前に書き換えると型のエラーになる
  const call = <Op extends BffOperation>(op: Op): BffMethod<Op> => {
    const method = async (...args: unknown[]): Promise<unknown> => {
      const result = await callBff({ op, args })
      if (result.ok) return result.data
      if (result.status === 401 && typeof window !== 'undefined') return redirectToLogin()
      throw new ApiError(result.status, result.message, [], result.code)
    }
    return method as BffMethod<Op>
  }
  return {
    facilities: { get: call('facilities.get') },
    me: { get: call('me.get'), externalCalendar: call('me.externalCalendar') },
    schedules: {
      list: call('schedules.list'),
      get: call('schedules.get'),
      create: call('schedules.create'),
      update: call('schedules.update'),
      cancel: call('schedules.cancel'),
      createRecurring: call('schedules.createRecurring'),
      changeRule: call('schedules.changeRule'),
    },
    staff: {
      list: call('staff.list'),
      listRecords: call('staff.listRecords'),
      get: call('staff.get'),
      create: call('staff.create'),
      update: call('staff.update'),
      changePosition: call('staff.changePosition'),
      addPolicy: call('staff.addPolicy'),
      removePolicy: call('staff.removePolicy'),
      remainingAssignments: call('staff.remainingAssignments'),
      startLeave: call('staff.startLeave'),
      reinstate: call('staff.reinstate'),
      retire: call('staff.retire'),
    },
    teams: {
      list: call('teams.list'),
      create: call('teams.create'),
      update: call('teams.update'),
    },
    departments: {
      list: call('departments.list'),
      create: call('departments.create'),
      update: call('departments.update'),
    },
    positions: { list: call('positions.list') },
    policies: { list: call('policies.list') },
    patients: {
      list: call('patients.list'),
      listRecords: call('patients.listRecords'),
      get: call('patients.get'),
      create: call('patients.create'),
      update: call('patients.update'),
      remainingSchedules: call('patients.remainingSchedules'),
      endService: call('patients.endService'),
      resumeService: call('patients.resumeService'),
    },
    serviceCodes: { list: call('serviceCodes.list') },
    calendars: {
      serviceAccount: call('calendars.serviceAccount'),
      list: call('calendars.list'),
      check: call('calendars.check'),
      link: call('calendars.link'),
      unlink: call('calendars.unlink'),
      preview: call('calendars.preview'),
      import: call('calendars.import'),
      exportIssues: call('calendars.exportIssues'),
      retryExport: call('calendars.retryExport'),
      cutoverStatus: call('calendars.cutoverStatus'),
      startCutover: call('calendars.startCutover'),
      completeCutover: call('calendars.completeCutover'),
      cancelCutover: call('calendars.cancelCutover'),
    },
  }
}
