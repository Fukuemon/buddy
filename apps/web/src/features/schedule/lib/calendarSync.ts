import type { CalendarSyncStatus } from '#/api/types'

/**
 * 最後に同期できた時刻からこの時間が過ぎたカレンダーを、最新でない可能性があるとみなす。
 * 同期の Worker の既定の間隔は 2 分で、lease は 6 分である。10 分成功しなければ、少なくとも数回の同期が続けて失敗しているか、
 * 同期が止まっている。
 */
export const CALENDAR_SYNC_STALE_MS = 10 * 60 * 1000

/**
 * Google カレンダーを正本にする事業所の予定の一覧を読み直す間隔。同期の Worker の既定の間隔（2 分）と同じにする。
 * 読み直さないと、画面を開いた後に同期が続けて成功していても、最後に同期できた時刻が古いまま残り、警告が出る。
 */
export const CALENDAR_SYNC_REFRESH_MS = 2 * 60 * 1000

/** 最新でない可能性があるカレンダーの状態。failed は最後の同期の失敗、stale は 10 分以上の未同期、never は同期したことが無い。 */
export type CalendarSyncProblem = 'failed' | 'stale' | 'never'

/** 状態ごとの文。 */
export const CALENDAR_SYNC_PROBLEM_LABEL: Record<CalendarSyncProblem, string> = {
  failed: '同期に失敗しています',
  stale: '10 分以上同期できていません',
  never: 'まだ同期していません',
}

/**
 * 同期の状況のうち、予定が最新でない可能性があるものを、その状態とともに返す。
 * 最後の同期が失敗したもの、同期できたことが無いもの、最後に同期できた時刻が now から CALENDAR_SYNC_STALE_MS より前のものが当たる。
 * 失敗の状態を、ほかの状態より先に当てる。
 */
export const calendarSyncProblemsOf = (syncs: CalendarSyncStatus[], now: Date) =>
  syncs.flatMap((sync): { sync: CalendarSyncStatus; problem: CalendarSyncProblem }[] => {
    if (sync.last_status === 'failed') return [{ sync, problem: 'failed' }]
    if (sync.last_succeeded_at === null) return [{ sync, problem: 'never' }]
    if (now.getTime() - Date.parse(sync.last_succeeded_at) > CALENDAR_SYNC_STALE_MS)
      return [{ sync, problem: 'stale' }]
    return []
  })
