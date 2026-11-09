import { z } from 'zod'

import type { BuddyApi } from '../BuddyApi'
import { SCHEDULE_CATEGORIES, SCHEDULE_KINDS, TEAM_COLORS } from '../types'

/** BuddyApi の操作の名前。`<グループ>.<メソッド>` の形にする。 */
type BuddyOperation = {
  [G in keyof BuddyApi]: `${G}.${keyof BuddyApi[G] & string}`
}[keyof BuddyApi]

/** 画面から BFF への呼び出し。args は BuddyApi の操作の引数で、先頭は事業所である。 */
export type BffCall = { op: BffOperation; args: unknown[] }

/** BuddyApi の操作が返す値。JSON にできる値に限る。 */
export type BffData = string | number | boolean | null | BffData[] | { [key: string]: BffData }

const id = z.string().min(1).max(64)
const dateTime = z.string().min(1).max(64)
const etag = z.string().min(1).max(256)
const scheduleInput = z.object({
  kind: z.enum(SCHEDULE_KINDS),
  title: z.string().max(255),
  staffId: id,
  startsAt: dateTime,
  endsAt: dateTime,
  description: z.string().max(10_000),
  visit: z
    .object({
      patientId: id,
      serviceCode: z.string().min(1).max(64),
      categories: z.array(z.enum(SCHEDULE_CATEGORIES)).max(SCHEDULE_CATEGORIES.length),
    })
    .optional(),
})
const staffName = z.string().min(1).max(128)
const phoneNumber = z.string().max(16).nullable().optional()
const staffUpdate = z.object({
  username: staffName,
  phone_number: phoneNumber,
  department_id: id,
  team_id: id,
  visits: z.boolean(),
})
const unitName = z.string().min(1).max(255)
const teamInput = z.object({ name: unitName, color: z.enum(TEAM_COLORS) })
const targetIds = z.array(id).max(500).optional()
const nameSearch = z.object({ name: z.string().max(100).optional() }).optional()
const patientInput = z.object({
  name: z.string().min(1).max(255),
  preferred_time: z.enum(['午前', '午後']),
  preferred_gender: z.enum(['男性', '女性']),
  service_code_id: id,
  assigned_staff_id: id,
})
const calendarId = z.string().min(1).max(1024)
const date = z.iso.date()
const recurringRule = z.object({
  frequency: z.enum(['weekly', 'monthly']),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7).nullable(),
  interval: z.number().int().min(1).max(52).nullable(),
  dayOfWeek: z.number().int().min(1).max(7).nullable(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  weekOfMonth: z.number().int().min(1).max(5).nullable(),
  endDate: date.nullable(),
})
const importRange = z.object({ range_start: date, range_end: date.nullable().optional() })
const decision = z.object({
  external_event_id: z.string().min(1).max(1024),
  revision: z.string().min(1).max(64),
  action: z.enum(['patient', 'normal', 'skip']),
  patient_id: id.optional(),
})

/** 操作ごとの引数の形。先頭は事業所で、BFF がセッションの事業所に替える。 */
const ARGS = {
  'facilities.get': z.tuple([id]),
  'me.get': z.tuple([id]),
  'me.externalCalendar': z.tuple([id]),
  'schedules.list': z.tuple([
    id,
    z.object({
      from: dateTime,
      to: dateTime,
      staffIds: z.array(id).max(500).optional(),
      includeCancelled: z.boolean().optional(),
    }),
  ]),
  'schedules.get': z.tuple([id, id]),
  'schedules.create': z.tuple([id, scheduleInput, id]),
  'schedules.update': z.tuple([id, id, scheduleInput, etag.nullable()]),
  'schedules.cancel': z.tuple([id, id, z.string().min(1).max(255), etag.nullable()]),
  'schedules.delete': z.tuple([id, id]),
  'schedules.createRecurring': z.tuple([id, scheduleInput, recurringRule, id]),
  'schedules.changeRule': z.tuple([
    id,
    id,
    z.object({
      effectiveDate: date,
      // この項目を送る前の画面からも受けるため、省いてよい
      firstWeekDate: date.optional(),
      id,
      rule: recurringRule,
    }),
    etag.nullable(),
  ]),
  'staff.list': z.tuple([id, nameSearch]),
  'staff.listRecords': z.tuple([id]),
  'staff.get': z.tuple([id, id]),
  'staff.create': z.tuple([
    id,
    staffUpdate.extend({
      email: z.string().min(1).max(254),
      position_id: id,
      visits: z.boolean().optional(),
    }),
  ]),
  'staff.update': z.tuple([id, id, staffUpdate]),
  'staff.changePosition': z.tuple([id, id, id]),
  'staff.addPolicy': z.tuple([
    id,
    id,
    z.object({ policy_id: id, target_user_ids: targetIds, target_team_ids: targetIds }),
  ]),
  'staff.removePolicy': z.tuple([id, id, id]),
  'staff.remainingAssignments': z.tuple([id, id]),
  'staff.startLeave': z.tuple([id, id, date.nullable()]),
  'staff.reinstate': z.tuple([id, id]),
  'staff.retire': z.tuple([id, id]),
  'teams.list': z.tuple([id]),
  'teams.create': z.tuple([id, teamInput]),
  'teams.update': z.tuple([id, id, teamInput]),
  'departments.list': z.tuple([id]),
  'departments.create': z.tuple([id, unitName]),
  'departments.update': z.tuple([id, id, unitName]),
  'positions.list': z.tuple([id]),
  'policies.list': z.tuple([id]),
  'patients.list': z.tuple([id, nameSearch]),
  'patients.listRecords': z.tuple([id]),
  'patients.get': z.tuple([id, id]),
  'patients.create': z.tuple([id, patientInput]),
  'patients.update': z.tuple([id, id, patientInput]),
  'patients.remainingSchedules': z.tuple([id, id]),
  'patients.endService': z.tuple([id, id]),
  'patients.resumeService': z.tuple([id, id, id]),
  'serviceCodes.list': z.tuple([id]),
  'calendars.serviceAccount': z.tuple([id]),
  'calendars.list': z.tuple([id]),
  'calendars.check': z.tuple([id, calendarId]),
  'calendars.link': z.tuple([id, z.object({ staffId: id, calendarId })]),
  'calendars.unlink': z.tuple([id, id]),
  'calendars.preview': z.tuple([id, id, importRange]),
  'calendars.import': z.tuple([
    id,
    id,
    importRange.extend({ decisions: z.array(decision).max(10_000) }),
  ]),
  'calendars.exportIssues': z.tuple([id]),
  'calendars.retryExport': z.tuple([id, id]),
  'calendars.cutoverStatus': z.tuple([id]),
  'calendars.startCutover': z.tuple([id]),
  'calendars.completeCutover': z.tuple([id, id]),
  'calendars.cancelCutover': z.tuple([id, id]),
} satisfies Partial<Record<BuddyOperation, z.ZodType>>

/** BFF が中継する操作の名前。ARGS に引数の形を書いた操作だけを中継する。 */
export type BffOperation = keyof typeof ARGS

/** 操作の名前が指す BuddyApi のメソッドの型。 */
export type BffMethod<Op extends BffOperation> = Op extends `${infer G}.${infer M}`
  ? G extends keyof BuddyApi
    ? M extends keyof BuddyApi[G]
      ? BuddyApi[G][M]
      : never
    : never
  : never

const BFF_OPERATIONS = Object.keys(ARGS) as BffOperation[]

/** call の引数を操作の形で読む。合えば知らないキーを除いた引数を、合わなければ理由を返す。 */
export const parseBffArgs = (
  call: BffCall,
): { ok: true; args: unknown[] } | { ok: false; message: string } => {
  const schema: z.ZodType = ARGS[call.op]
  const result = schema.safeParse(call.args)
  return result.success
    ? { ok: true, args: result.data as unknown[] }
    : { ok: false, message: z.prettifyError(result.error) }
}

/** BFF のレスポンス。ApiError は class のままでは server function を越えられないので、値にして返す。code は API の Error の code である。 */
export type BffResult =
  | { ok: true; data: BffData }
  | { ok: false; status: number; message: string; code?: string }

/** server function の入力を BffCall として読む。知らない操作か、形の違う入力なら Error を投げる。 */
export const parseBffCall = (input: unknown): BffCall => {
  if (typeof input !== 'object' || input === null) throw new Error('BFF の呼び出しの形が正しくない')
  const { op, args } = input as Record<string, unknown>
  if (!BFF_OPERATIONS.includes(op as BffOperation))
    throw new Error(`BFF が中継しない操作 ${String(op)}`)
  if (!Array.isArray(args)) throw new Error('BFF の呼び出しの args は配列にする')
  return { op: op as BffOperation, args }
}
