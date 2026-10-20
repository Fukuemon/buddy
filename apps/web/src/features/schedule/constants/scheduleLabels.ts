import type { ScheduleCategory, ScheduleKind, ServiceCode } from '#/api/types'

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  normal: '通常',
  visit: '訪問',
}

export const SCHEDULE_CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  night: '夜勤',
  emergency: '緊急',
  hospitalization: '入院',
}

/** サービスコードごとの提供時間（分）の範囲。 */
export const SERVICE_CODE_DURATION: Record<ServiceCode, { min: number; max: number }> = {
  訪看I2: { min: 20, max: 29 },
  訪看I3: { min: 30, max: 59 },
  訪看I4: { min: 60, max: 89 },
  訪看I5: { min: 21, max: 40 },
  '訪看I5・2超': { min: 31, max: 60 },
  予防看I2: { min: 20, max: 29 },
  予防看I3: { min: 30, max: 59 },
  予防看I4: { min: 60, max: 89 },
  予防看I5: { min: 21, max: 40 },
  '予防看I5・2超': { min: 31, max: 60 },
  医: { min: 30, max: 90 },
}
