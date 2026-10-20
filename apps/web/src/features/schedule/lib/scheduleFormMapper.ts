import type { Schedule, ScheduleInput, ScheduleKind, Staff } from '#/api/types'

import { SERVICE_CODE_DURATION } from '../constants/scheduleLabels'
import type { ScheduleFormValues } from '../schema/scheduleForm'
import { addMinutesToTimeKey, combineDateTime, diffMinutes, toDateKey, toTimeKey } from './dateTime'

const VISIT_TITLE = '訪問'
const DEFAULT_START_TIME = '09:00'
const DEFAULT_SERVICE_CODE = '訪看I2'

export type ScheduleFormDefaults = {
  kind: ScheduleKind
  /** `YYYY-MM-DD` */
  date: string
  /** `HH:mm`。省くと 9 時にする。 */
  time?: string
  staffId?: Staff['id']
}

/**
 * 作成のフォームの初期値を返す。
 * 通常の予定は開始から 1 時間、訪問の予定は既定のサービスコードの上限の提供時間にする。
 */
export const createScheduleFormValues = ({
  kind,
  date,
  time = DEFAULT_START_TIME,
  staffId = '',
}: ScheduleFormDefaults): ScheduleFormValues => {
  const base = { staffId, scheduleDate: date, startTime: time, description: '' }
  return kind === 'visit'
    ? {
        ...base,
        kind,
        patientId: '',
        serviceCode: DEFAULT_SERVICE_CODE,
        serviceTime: SERVICE_CODE_DURATION[DEFAULT_SERVICE_CODE].max,
        categories: [],
      }
    : { ...base, kind, title: '', endTime: addMinutesToTimeKey(time, 60) }
}

/** 予定を、編集のフォームの値にする。 */
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
      serviceTime: diffMinutes(base.startTime, toTimeKey(end)),
      categories: schedule.visit.categories,
    }
  }
  return { ...base, kind: 'normal', title: schedule.title, endTime: toTimeKey(end) }
}

/** 訪問の予定の終了時間を、開始時間と提供時間から求める。 */
export const visitEndTime = (startTime: string, serviceTime: number) =>
  addMinutesToTimeKey(startTime, serviceTime)

/** 検証を通ったフォームの値を、API に送る値にする。 */
export const toScheduleInput = (values: ScheduleFormValues): ScheduleInput => {
  const startsAt = combineDateTime(values.scheduleDate, values.startTime)
  if (values.kind === 'visit') {
    return {
      kind: 'visit',
      title: VISIT_TITLE,
      staffId: values.staffId,
      startsAt,
      endsAt: combineDateTime(
        values.scheduleDate,
        visitEndTime(values.startTime, values.serviceTime),
      ),
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
    endsAt: combineDateTime(values.scheduleDate, values.endTime),
    description: values.description,
  }
}
