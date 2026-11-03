import { fakePatients, fakeStaffList } from '#/api/fake/fixtures'
import type { ImportDecision, ImportPreview, ImportResult } from '#/api/types'
import {
  createMockImportPreview,
  createMockImportResult,
  createMockImportedPreview,
  mockExternalCalendars,
  mockServiceAccount,
} from '#/mocks/scheduleData'

import type { CalendarLinkRow } from './CalendarLinkTable'

/** 職員の一覧の行。青木 一郎と石川 二葉にカレンダーを結び付けてある。 */
export const storyLinkRows: CalendarLinkRow[] = fakeStaffList.map((staff) => ({
  staff,
  calendar: mockExternalCalendars.find((calendar) => calendar.staff_id === staff.id),
}))

/** サービスアカウントのメールアドレス。 */
export const storyServiceAccount = mockServiceAccount

/** 事業所の利用者。 */
export const storyPatients = fakePatients

const range = { range_start: '2026-11-01', range_end: '2026-11-30' }

/** 確認が必要な予定が 2 件あるプレビューの結果。 */
export const storyPreview: ImportPreview = createMockImportPreview(range)

/** 全て取り込み済みのプレビューの結果。 */
export const storyAllImportedPreview: ImportPreview = createMockImportedPreview(range)

/** 1 件目に利用者を選び、2 件目を通常の予定にした取り込み方。 */
export const storyDecisions: ImportDecision[] = [
  {
    external_event_id: 'event-ambiguous',
    revision: 'rev-ambiguous',
    action: 'patient',
    patient_id: 'patient-1',
  },
  { external_event_id: 'event-missing', revision: 'rev-missing', action: 'normal' },
]

/** storyDecisions で確定した取り込みの結果。 */
export const storyResult: ImportResult = createMockImportResult(
  'calendar-1',
  storyPreview,
  storyDecisions,
)
