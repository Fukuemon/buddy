import type { components } from '../generated/schedule'
import {
  SCHEDULE_CATEGORIES,
  type Facility,
  SCHEDULE_POLICY_CODES,
  type Schedule,
  type SchedulePolicy,
  type SchedulePolicyCode,
  type ScheduleCategory,
  type ScheduleInput,
  type ScheduleKind,
  type Patient,
  type RecurringRule,
  type Staff,
  type Team,
  type Viewer,
} from '../types'

type Schemas = components['schemas']
/** 予定の API が返す予定。 */
export type ApiSchedule = Schemas['Schedule']
/** 予定の API の作成と更新で送る本文。 */
export type ApiSlotRequest = Schemas['SlotRequest']

/** 予定の作成で、画面の値を API の ID に引くためのマスタ。 */
export type ScheduleMasters = {
  scheduleTypes: Schemas['ScheduleType'][]
  serviceCodes: Schemas['ServiceCode'][]
  visitCategories: Schemas['VisitCategory'][]
}

const KIND_TO_API: Record<ScheduleKind, Schemas['ScheduleTypeName']> = {
  normal: '通常',
  visit: '訪問',
}

/** 訪問の区分の、API のマスタの name。 */
const CATEGORY_TO_API: Record<ScheduleCategory, string> = {
  night: '夜勤',
  emergency: '緊急',
  hospitalization: '入院',
}

/** API の職員を、画面の職員にする。画面は名前を username で表す。 */
export const fromApiStaff = (user: Schemas['Staff']): Staff => {
  const staff: Staff = {
    id: user.id,
    name: user.username,
    teamId: user.team.id,
    email: user.email,
  }
  if (user.status !== 'active') staff.status = user.status
  if (!user.visits) staff.nonVisiting = true
  return staff
}

/** 職員の権限のうち、予定の権限だけを画面の予定の権限にする。画面の知らない code は捨てる。 */
export const fromApiSchedulePolicies = (
  policies: Schemas['StaffDetail']['policies'],
): SchedulePolicy[] =>
  policies.flatMap(({ code, target_user_ids, target_team_ids }) =>
    isSchedulePolicyCode(code)
      ? [{ code, targetStaffIds: target_user_ids, targetTeamIds: target_team_ids }]
      : [],
  )

const isSchedulePolicyCode = (code: string): code is SchedulePolicyCode =>
  (SCHEDULE_POLICY_CODES as readonly string[]).includes(code)

/** GET /v1/me の職員を、画面の出し分けに使うログインした職員にする。 */
export const fromApiMe = (me: Schemas['StaffDetail']): Viewer => ({
  staffId: me.id,
  staffName: me.username,
  facilityId: me.facility_id,
  policyCodes: me.policies.map((p) => p.code),
  schedulePolicies: fromApiSchedulePolicies(me.policies),
})

/** API のチームを、画面のチームにする。 */
export const fromApiTeam = ({ id, name, color }: Schemas['Team']): Team => ({ id, name, color })

/** API の利用者を、画面の利用者にする。 */
export const fromApiPatient = ({
  id,
  name,
  service_code,
  ended_at,
}: Schemas['Patient']): Patient =>
  ended_at === null
    ? { id, name, serviceCode: service_code }
    : { id, name, serviceCode: service_code, ended: true }

/** API の日付と時刻は事業所の現地時刻で、事業所は日本にあるものとする。 */
const OFFSET = '+09:00'
const OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const toCategory = (name: string): ScheduleCategory => {
  const found = SCHEDULE_CATEGORIES.find((category) => CATEGORY_TO_API[category] === name)
  if (found === undefined) throw new Error(`画面が知らない訪問の区分 ${name} を受けた`)
  return found
}

/** API の日付と時刻を、+09:00 の ISO 8601 の日時にする。 */
const toDateTime = (date: string, time: string) => `${date}T${time}:00${OFFSET}`

/** YYYY-MM-DD の翌日の YYYY-MM-DD を返す。 */
const nextDate = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * ISO 8601 の日時を、+09:00 の日付（YYYY-MM-DD）と時刻（HH:MM）に分ける。
 *
 * 日時として読めなければ Error を投げる。
 */
export const splitDateTime = (dateTime: string) => {
  const time = Date.parse(dateTime)
  if (Number.isNaN(time)) throw new Error(`日時 ${dateTime} を読めない`)
  const local = new Date(time + OFFSET_MS).toISOString()
  return { date: local.slice(0, 10), time: local.slice(11, 16) }
}

/**
 * API の単発の予定を、画面の予定にする。終了が翌日の印が付いた予定は、終了の日時を日付の翌日にする。
 *
 * サービスコードか訪問の区分が画面の知らない値なら Error を投げる。
 */
export const fromApiSchedule = (schedule: ApiSchedule): Schedule => {
  const result: Schedule = {
    id: schedule.id,
    facilityId: schedule.facility_id,
    kind: schedule.schedule_type === '訪問' ? 'visit' : 'normal',
    title: schedule.title ?? '',
    staffId: schedule.staff_id,
    startsAt: toDateTime(schedule.date, schedule.start_time),
    endsAt: toDateTime(
      schedule.ends_next_day ? nextDate(schedule.date) : schedule.date,
      schedule.end_time,
    ),
    description: schedule.description ?? '',
  }
  const visit = schedule.visit_info
  if (visit !== null) {
    result.visit = {
      patientId: visit.patient_id,
      serviceCode: visit.service_code,
      categories: visit.visit_categories.map((c) => toCategory(c.name)),
    }
  }
  if (schedule.cancel !== null) result.cancel = { reason: schedule.cancel.reason }
  if (schedule.source === 'google_calendar') result.fromGoogleCalendar = true
  if (schedule.etag !== null) result.etag = schedule.etag
  if (schedule.review_reason !== null) result.reviewReason = schedule.review_reason
  if (schedule.recurring_rule != null && schedule.recurring_schedule_id !== null) {
    result.recurrence = {
      recurringScheduleId: schedule.recurring_schedule_id,
      rule: fromApiRecurringRule(schedule.recurring_rule),
    }
  }
  return result
}

/** API の繰り返しの規則を、画面の繰り返しの規則にする。 */
export const fromApiRecurringRule = (rule: Schemas['RecurringRule']): RecurringRule => ({
  frequency: rule.frequency,
  dayOfWeek: rule.day_of_week ?? null,
  dayOfMonth: rule.day_of_month ?? null,
  weekOfMonth: rule.week_of_month ?? null,
  endDate: rule.end_date ?? null,
})

/** 画面の繰り返しの規則を、API の繰り返しの規則にする。 */
export const toApiRecurringRule = (rule: RecurringRule): Schemas['RecurringRule'] => ({
  frequency: rule.frequency,
  day_of_week: rule.dayOfWeek,
  day_of_month: rule.dayOfMonth,
  week_of_month: rule.weekOfMonth,
  end_date: rule.endDate,
})

/** API の事業所を、画面の事業所にする。 */
export const fromApiFacility = ({ id, name, source_mode }: Schemas['Facility']): Facility => ({
  id,
  name,
  sourceMode: source_mode,
})

const idOf = <T extends { id: string }>(items: T[], match: (item: T) => boolean, what: string) => {
  const found = items.find(match)
  if (found === undefined) throw new Error(`API のマスタに ${what} がない`)
  return found.id
}

/**
 * 画面の予定の入力を、API の単発の予定の作成の本文にする。
 *
 * 終了が開始の翌日なら ends_next_day を付ける。
 * 長さが 0 以下か 24 時間以上、マスタに当たる値がない、のいずれかで Error を投げる。
 * 訪問の予定の担当は予定の職員にし、同行者は付けない。
 */
export const toSlotRequest = (input: ScheduleInput, masters: ScheduleMasters): ApiSlotRequest => {
  const start = splitDateTime(input.startsAt)
  const end = splitDateTime(input.endsAt)
  const length = Date.parse(input.endsAt) - Date.parse(input.startsAt)
  if (length <= 0 || length >= DAY_MS) {
    throw new Error('予定の API は、長さが 0 より長く 24 時間未満の予定だけを受ける')
  }
  const typeName = KIND_TO_API[input.kind]
  const visit = input.kind === 'visit' ? input.visit : undefined
  return {
    schedule_type_id: idOf(
      masters.scheduleTypes,
      (t) => t.name === typeName,
      `予定の種類 ${typeName}`,
    ),
    date: start.date,
    start_time: start.time,
    end_time: end.time,
    ends_next_day: start.date !== end.date,
    staff_id: input.staffId,
    title: input.title === '' ? null : input.title,
    description: input.description === '' ? null : input.description,
    visit_info:
      visit === undefined
        ? null
        : {
            patient_id: visit.patientId,
            assigned_staff_id: input.staffId,
            companion_id: null,
            service_code_id: idOf(
              masters.serviceCodes,
              (c) => c.code === visit.serviceCode,
              `サービスコード ${visit.serviceCode}`,
            ),
            visit_category_ids: visit.categories.map((category) =>
              idOf(
                masters.visitCategories,
                (c) => c.name === CATEGORY_TO_API[category],
                `訪問の区分 ${CATEGORY_TO_API[category]}`,
              ),
            ),
          },
  }
}

/**
 * 予定の置き換えの本文に、画面が持たない今の予定の値を引き継ぐ。
 *
 * 訪問の予定どうしの置き換えでは、同行者とタイトルを今の値のままにする。担当は、今の担当が予定の職員と同じなら新しい予定の職員に、違えば今の担当のままにする。
 */
export const keepCurrentVisit = (body: ApiSlotRequest, current: ApiSchedule): ApiSlotRequest => {
  const visit = body.visit_info
  const currentVisit = current.visit_info
  if (visit === null || visit === undefined || currentVisit === null) return body
  return {
    ...body,
    title: current.title,
    visit_info: {
      ...visit,
      companion_id: currentVisit.companion_id,
      assigned_staff_id:
        currentVisit.assigned_staff_id === current.staff_id
          ? body.staff_id
          : currentVisit.assigned_staff_id,
    },
  }
}
