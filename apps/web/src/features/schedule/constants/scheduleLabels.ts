import type { ScheduleCategory, ScheduleKind } from '#/api/types'

export const SCHEDULE_KIND_LABEL: Record<ScheduleKind, string> = {
  normal: '通常',
  visit: '訪問',
}

export const SCHEDULE_CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  night: '夜勤',
  emergency: '緊急',
  hospitalization: '入院',
}
