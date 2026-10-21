import { z } from 'zod'

import { SCHEDULE_CATEGORIES, SCHEDULE_KINDS, SERVICE_CODES } from '../types'

/** BFF が中継する BuddyApi の操作。 */
export const BFF_OPERATIONS = [
  'schedules.list',
  'schedules.get',
  'schedules.create',
  'schedules.update',
  'staff.list',
  'teams.list',
  'patients.list',
  'calendars.serviceAccount',
  'calendars.list',
  'calendars.check',
  'calendars.link',
  'calendars.unlink',
  'calendars.preview',
  'calendars.import',
  'calendars.exportIssues',
  'calendars.retryExport',
] as const

/** BFF が中継する操作の名前。 */
export type BffOperation = (typeof BFF_OPERATIONS)[number]

/** 画面から BFF への呼び出し。args は BuddyApi の操作の引数で、先頭は事業所である。 */
export type BffCall = { op: BffOperation; args: unknown[] }

/** BuddyApi の操作が返す値。JSON にできる値に限る。 */
export type BffData = string | number | boolean | null | BffData[] | { [key: string]: BffData }

const id = z.string().min(1).max(64)
const dateTime = z.string().min(1).max(64)
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
      serviceCode: z.enum(SERVICE_CODES),
      categories: z.array(z.enum(SCHEDULE_CATEGORIES)).max(SCHEDULE_CATEGORIES.length),
    })
    .optional(),
})
const nameSearch = z.object({ name: z.string().max(100).optional() }).optional()
const calendarId = z.string().min(1).max(1024)
const date = z.iso.date()
const importRange = z.object({ range_start: date, range_end: date })
const decision = z.object({
  external_event_id: z.string().min(1).max(1024),
  revision: z.string().min(1).max(64),
  action: z.enum(['patient', 'normal', 'skip']),
  patient_id: id.optional(),
})

/** 操作ごとの引数の形。先頭は事業所で、BFF がセッションの事業所に替える。 */
const ARGS: Record<BffOperation, z.ZodType> = {
  'schedules.list': z.tuple([
    id,
    z.object({ from: dateTime, to: dateTime, staffIds: z.array(id).max(500).optional() }),
  ]),
  'schedules.get': z.tuple([id, id]),
  'schedules.create': z.tuple([id, scheduleInput]),
  'schedules.update': z.tuple([id, id, scheduleInput]),
  'staff.list': z.tuple([id, nameSearch]),
  'teams.list': z.tuple([id]),
  'patients.list': z.tuple([id, nameSearch]),
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
}

/** call の引数を操作の形で読む。合えば知らないキーを除いた引数を、合わなければ理由を返す。 */
export const parseBffArgs = (
  call: BffCall,
): { ok: true; args: unknown[] } | { ok: false; message: string } => {
  const result = ARGS[call.op].safeParse(call.args)
  return result.success
    ? { ok: true, args: result.data as unknown[] }
    : { ok: false, message: z.prettifyError(result.error) }
}

/** BFF の応答。ApiError は class のままでは server function を越えられないので、値にして返す。code は API の Error の code である。 */
export type BffResult =
  | { ok: true; data: BffData }
  | { ok: false; status: number; message: string; code?: string }

/** server function の入力を BffCall として読む。知らない操作か形の誤りなら Error を投げる。 */
export const parseBffCall = (input: unknown): BffCall => {
  if (typeof input !== 'object' || input === null) throw new Error('BFF の呼び出しの形が正しくない')
  const { op, args } = input as Record<string, unknown>
  if (!BFF_OPERATIONS.includes(op as BffOperation))
    throw new Error(`BFF が中継しない操作 ${String(op)}`)
  if (!Array.isArray(args)) throw new Error('BFF の呼び出しの args は配列にする')
  return { op: op as BffOperation, args }
}
