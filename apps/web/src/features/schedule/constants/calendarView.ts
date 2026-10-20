export const CALENDAR_VIEWS = ['month', 'week', 'day'] as const
export type CalendarView = (typeof CALENDAR_VIEWS)[number]

export const CALENDAR_VIEW_LABEL: Record<CalendarView, string> = {
  month: '月',
  week: '週',
  day: '日',
}
