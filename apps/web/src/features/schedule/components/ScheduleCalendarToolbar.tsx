import { Button } from '#/components/base/Button'
import { TextTab } from '#/components/base/TextTab'
import PrevIcon from '#/assets/icons/arrow-left.svg?react'
import NextIcon from '#/assets/icons/arrow-right.svg?react'

import { CALENDAR_VIEWS, CALENDAR_VIEW_LABEL, type CalendarView } from '../constants/calendarView'

const VIEW_TABS = CALENDAR_VIEWS.map((view) => ({ id: view, label: CALENDAR_VIEW_LABEL[view] }))

export type ScheduleCalendarToolbarProps = {
  view: CalendarView
  /** `YYYY-MM-DD` */
  date: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onViewChange: (view: CalendarView) => void
  onDateChange: (dateKey: string) => void
  /** 渡したときだけ、予定の作成のボタンを出す。 */
  onCreate?: () => void
}

/** カレンダーの上の操作。前後への移動、今日、表示の種類、日付の指定、予定の作成を並べる。 */
export const ScheduleCalendarToolbar = ({
  view,
  date,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onDateChange,
  onCreate,
}: ScheduleCalendarToolbarProps) => (
  <div className="flex h-16 items-center justify-between gap-4 md:gap-10">
    <div className="flex items-center gap-2">
      <button
        aria-label="前へ"
        className="grid size-10 place-items-center rounded-lg hover:bg-gray-10"
        data-testid="calendar-prev"
        onClick={onPrev}
        type="button"
      >
        <PrevIcon height={24} width={24} />
      </button>
      <Button data-testid="calendar-today" onClick={onToday} size="S" variant="secondary">
        今日
      </Button>
      <button
        aria-label="次へ"
        className="grid size-10 place-items-center rounded-lg hover:bg-gray-10"
        data-testid="calendar-next"
        onClick={onNext}
        type="button"
      >
        <NextIcon height={24} width={24} />
      </button>
      <input
        aria-label="表示する日付"
        className="ml-2 h-10 rounded-xl px-3 ring-1 ring-gray-200 ring-inset"
        data-testid="calendar-date"
        onChange={(event) => {
          if (event.target.value !== '') onDateChange(event.target.value)
        }}
        type="date"
        value={date}
      />
    </div>
    <div className="flex items-center gap-4">
      <div className="w-48">
        <TextTab
          activeTabId={view}
          data-testid="calendar-view"
          onTabChange={onViewChange}
          tabs={VIEW_TABS}
        />
      </div>
      {onCreate !== undefined && (
        <Button data-testid="schedule-create-open" onClick={onCreate} size="S">
          予定を作成
        </Button>
      )}
    </div>
  </div>
)
