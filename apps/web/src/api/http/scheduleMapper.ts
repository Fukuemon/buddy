import type { components } from '../generated/schedule'
import {
  SCHEDULE_CATEGORIES,
  SERVICE_CODES,
  type Schedule,
  type ScheduleCategory,
  type ScheduleInput,
  type ScheduleKind,
  type ServiceCode,
} from '../types'

type Schemas = components['schemas']
export type ApiSchedule = Schemas['Schedule']
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

/** API の日付と時刻は事業所の現地時刻で、事業所は日本にあるものとする。 */
const OFFSET = '+09:00'
const OFFSET_MS = 9 * 60 * 60 * 1000

/** 全角と半角の数字の表記の違いを吸収して比べる。古いシードは全角（訪看I２）で入っている。 */
const sameServiceCode = (a: string, b: string) => a.normalize('NFKC') === b.normalize('NFKC')

const toServiceCode = (code: string): ServiceCode => {
  const found = SERVICE_CODES.find((c) => sameServiceCode(c, code))
  if (found === undefined) throw new Error(`画面が知らないサービスコード ${code} を受けた`)
  return found
}

const toCategory = (name: string): ScheduleCategory => {
  const found = SCHEDULE_CATEGORIES.find((category) => CATEGORY_TO_API[category] === name)
  if (found === undefined) throw new Error(`画面が知らない訪問の区分 ${name} を受けた`)
  return found
}

/** API の日付と時刻を、+09:00 の ISO 8601 の日時にする。 */
export const toDateTime = (date: string, time: string) => `${date}T${time}:00${OFFSET}`

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
 * API の単発の予定を、画面の予定にする。
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
    endsAt: toDateTime(schedule.date, schedule.end_time),
    description: schedule.description ?? '',
  }
  const visit = schedule.visit_info
  if (visit !== null) {
    result.visit = {
      patientId: visit.patient_id,
      serviceCode: toServiceCode(visit.service_code),
      categories: visit.visit_categories.map((c) => toCategory(c.name)),
    }
  }
  return result
}

const idOf = <T extends { id: string }>(items: T[], match: (item: T) => boolean, what: string) => {
  const found = items.find(match)
  if (found === undefined) throw new Error(`API のマスタに ${what} がない`)
  return found.id
}

/**
 * 画面の予定の入力を、API の単発の予定の作成の本文にする。
 *
 * 開始と終了の日付が違う、マスタに当たる値がない、のいずれかで Error を投げる。
 * 訪問の予定の担当は予定の職員にし、同行者は付けない。
 */
export const toSlotRequest = (input: ScheduleInput, masters: ScheduleMasters): ApiSlotRequest => {
  const start = splitDateTime(input.startsAt)
  const end = splitDateTime(input.endsAt)
  if (start.date !== end.date) {
    throw new Error('予定の API は日付をまたぐ予定を受けない')
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
              (c) => sameServiceCode(c.code, visit.serviceCode),
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
