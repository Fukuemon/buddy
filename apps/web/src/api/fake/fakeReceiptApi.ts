import type { ReceiptApi } from '../BuddyApi'
import type { ReceiptReport } from '../types'

const range = (min: number, max: number) => ({ min, max })

/** フェイクの照合の API が返す結果。4 つの区分と、記号の付く判定を 1 行ずつ持つ。 */
export const fakeReceiptReport: ReceiptReport = {
  summary: { mismatch: 1, schedule_only: 1, visit_only: 1, match: 1 },
  rows: [
    {
      category: 'mismatch',
      date: '2024-04-01',
      client: '加藤 春子',
      staff: '青木 一郎',
      schedule: { line: 2, start: '10:00', end: '10:29', duration: 29, service: '訪看I２' },
      visit: {
        line: 3,
        start: '10:05',
        end: '10:40',
        duration: 35,
        service: '訪看I２',
        additions: '緊急',
      },
      checks: {
        start: { ok: false },
        service: { ok: true },
        schedule_elapsed: { ok: true, minutes: 29, range: range(20, 29) },
        visit_elapsed: { ok: false, minutes: 35, range: range(20, 29) },
        schedule_duration: { ok: true, minutes: 29, range: range(20, 29) },
        visit_duration: { ok: false, minutes: 35, range: range(20, 29) },
        additions: { ok: false },
        duration_equal: false,
        end_equal: false,
      },
    },
    {
      category: 'schedule_only',
      date: '2024-04-01',
      client: '木村 夏夫',
      staff: '石川 二葉',
      schedule: { line: 4, start: '09:00', end: '09:29', duration: 29, service: '訪看I２' },
      visit: null,
      checks: null,
    },
    {
      category: 'visit_only',
      date: '2024-04-02',
      client: '加藤 春子',
      staff: '上田 三奈',
      schedule: null,
      visit: {
        line: 5,
        start: '09:00',
        end: '09:29',
        duration: null,
        service: '訪看I２',
        additions: '通常',
      },
      checks: null,
    },
    {
      category: 'match',
      date: '2024-04-03',
      client: '木村 夏夫',
      staff: '江藤 四郎',
      schedule: { line: 6, start: '13:00', end: '14:00', duration: 60, service: '医' },
      visit: {
        line: 7,
        start: '13:00',
        end: '13:50',
        duration: 50,
        service: '基本療養費(I)',
        additions: '通常',
      },
      checks: {
        start: { ok: true },
        service: { ok: true },
        schedule_elapsed: { ok: true, minutes: 60, range: range(30, 90) },
        visit_elapsed: { ok: true, minutes: 50, range: range(30, 90) },
        schedule_duration: { ok: true, minutes: 60, range: range(30, 90) },
        visit_duration: { ok: true, minutes: 50, range: range(30, 90) },
        additions: { ok: true },
        duration_equal: false,
        end_equal: false,
      },
    },
  ],
  warnings: [
    {
      calendar_id: 'calendar-demo',
      event_id: 'event-1',
      start: '2024-04-05T10:00:00+09:00',
      reason: 'unreadable_title',
      message: 'タイトルに `【…】` の組がない',
    },
  ],
}

/** フェイクの照合の API を作る。入力によらず fakeReceiptReport を返す。 */
export const createFakeReceiptApi = (): ReceiptApi => ({
  check: async () => structuredClone(fakeReceiptReport),
})
