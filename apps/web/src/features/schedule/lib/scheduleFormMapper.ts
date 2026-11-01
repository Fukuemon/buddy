import type { Schedule, ScheduleInput, ScheduleKind, ServiceCodeRecord, Staff } from '#/api/types'

import type { ScheduleFormValues } from '../schema/scheduleForm'
import {
  addDaysToDateKey,
  addMinutesToTimeKey,
  combineDateTime,
  diffMinutes,
  toDateKey,
  toTimeKey,
} from './dateTime'

const VISIT_TITLE = '訪問'
const DEFAULT_START_TIME = '09:00'

/** 作成のフォームの初期のサービスコードの表記。 */
const DEFAULT_SERVICE_CODE = '訪看I2'

/**
 * serviceCodes（予定の API のサービスコードの一覧）のうち、作成のフォームの初期値にするサービスコードを返す。
 * 「訪看I2」を、全角と半角の数字の違いを問わずに探し、無ければ一覧の先頭を返す。一覧が空なら undefined を返す。
 */
export const defaultServiceCode = (serviceCodes: readonly ServiceCodeRecord[]) =>
  serviceCodes.find((code) => code.code.normalize('NFKC') === DEFAULT_SERVICE_CODE) ??
  serviceCodes[0]

/** createScheduleFormValues の引数。time を省くと 9 時、staffId を省くと未選択にする。serviceCode を省くとサービスコードを未選択にする。 */
type ScheduleFormDefaults = {
  kind: ScheduleKind
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:mm`。省くと 9 時にする。 */
  time?: string
  staffId?: Staff['id']
  /** 訪問の予定の初期のサービスコード。defaultServiceCode の値を渡す。 */
  serviceCode?: ServiceCodeRecord
}

/**
 * 作成のフォームの初期値を返す。
 * 通常の予定は開始から 1 時間にし、24 時を過ぎれば終了を翌日にする。訪問の予定は serviceCode の上限の提供時間にする。
 */
export const createScheduleFormValues = ({
  kind,
  date,
  time = DEFAULT_START_TIME,
  staffId = '',
  serviceCode,
}: ScheduleFormDefaults): ScheduleFormValues => {
  const base = { staffId, scheduleDate: date, startTime: time, description: '' }
  return kind === 'visit'
    ? {
        ...base,
        kind,
        patientId: '',
        serviceCode: serviceCode?.code ?? '',
        serviceTime: serviceCode?.service_time_range_end ?? 0,
        categories: [],
      }
    : {
        ...base,
        kind,
        title: '',
        ...endOfDuration(time, 60),
      }
}

/** 予定を、編集のフォームの値にする。終了が開始の翌日の予定は、翌日の印を付ける。 */
export const toScheduleFormValues = (schedule: Schedule): ScheduleFormValues => {
  const start = new Date(schedule.startsAt)
  const end = new Date(schedule.endsAt)
  const base = {
    staffId: schedule.staffId,
    scheduleDate: toDateKey(start),
    startTime: toTimeKey(start),
    description: schedule.description,
  }
  if (schedule.kind === 'visit' && schedule.visit !== undefined) {
    return {
      ...base,
      kind: 'visit',
      patientId: schedule.visit.patientId,
      serviceCode: schedule.visit.serviceCode,
      serviceTime: Math.round((end.getTime() - start.getTime()) / MS_PER_MINUTE),
      categories: schedule.visit.categories,
    }
  }
  return {
    ...base,
    kind: 'normal',
    title: schedule.title,
    endTime: toTimeKey(end),
    endsNextDay: toDateKey(end) !== base.scheduleDate,
  }
}

const MS_PER_MINUTE = 60 * 1000
const MINUTES_PER_DAY = 24 * 60

/** 予定の終了の時刻と、終了が開始の翌日か。 */
export type ScheduleEnd = { endTime: string; endsNextDay: boolean }

/** 開始時間から minutes 分の後の終了を求める。開始時間と minutes の和が 24 時以上なら、終了を翌日にする。 */
const endOfDuration = (startTime: string, minutes: number): ScheduleEnd => ({
  endTime: addMinutesToTimeKey(startTime, minutes),
  endsNextDay: diffMinutes('00:00', startTime) + minutes >= MINUTES_PER_DAY,
})

/**
 * 入力の途中の値から、訪問の予定の終了を求める。開始時間か提供時間がそろっていなければ undefined を返す。
 * 欄を空にすると、開始時間は空の文字列、提供時間は NaN になる。
 */
export const visitEndOfInput = (startTime?: string, serviceTime?: number) =>
  isTimeKey(startTime) && Number.isFinite(serviceTime)
    ? endOfDuration(startTime, serviceTime as number)
    : undefined

/** 終了の時刻を、翌日なら「翌日 00:30」、当日なら「00:30」の形にする。 */
export const formatEndTime = ({ endTime, endsNextDay }: ScheduleEnd) =>
  endsNextDay ? `翌日 ${endTime}` : endTime

/** 予定の日付と終了から、終了の日時を作る。 */
const endsAtOf = (scheduleDate: string, { endTime, endsNextDay }: ScheduleEnd) =>
  combineDateTime(endsNextDay ? addDaysToDateKey(scheduleDate, 1) : scheduleDate, endTime)

const isTimeKey = (value?: string): value is string =>
  value !== undefined && /^\d{2}:\d{2}$/.test(value)

/** 検証を通ったフォームの値を、API に送る値にする。 */
export const toScheduleInput = (values: ScheduleFormValues): ScheduleInput => {
  const startsAt = combineDateTime(values.scheduleDate, values.startTime)
  if (values.kind === 'visit') {
    return {
      kind: 'visit',
      title: VISIT_TITLE,
      staffId: values.staffId,
      startsAt,
      endsAt: endsAtOf(values.scheduleDate, endOfDuration(values.startTime, values.serviceTime)),
      description: values.description,
      visit: {
        patientId: values.patientId,
        serviceCode: values.serviceCode,
        categories: values.categories,
      },
    }
  }
  return {
    kind: 'normal',
    title: values.title,
    staffId: values.staffId,
    startsAt,
    endsAt: endsAtOf(values.scheduleDate, values),
    description: values.description,
  }
}
