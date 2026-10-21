import { Button, SegmentedControl } from '@buddy/ui'
import PrevIcon from '#/assets/icons/arrow-left.svg?react'
import NextIcon from '#/assets/icons/arrow-right.svg?react'

import { CALENDAR_VIEWS, CALENDAR_VIEW_LABEL, type CalendarView } from '../constants/calendarView'

const VIEW_OPTIONS = CALENDAR_VIEWS.map((view) => ({ id: view, label: CALENDAR_VIEW_LABEL[view] }))

/** 職員の絞り込みのドロワーを開くボタンに渡す値。 */
export type StaffFilterToggle = {
  isOpen: boolean
  /** ドロワーの `<dialog>` の id */
  controlsId: string
  onOpen: () => void
}

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
  /** 渡したときだけ、職員の絞り込みを開くボタンを出す。幅 768px 未満で渡す。 */
  staffFilterToggle?: StaffFilterToggle
}

/** カレンダーの上の操作。前後への移動、今日、表示の種類、日付の指定、職員の絞り込みを開く、予定の作成を並べる。 */
export const ScheduleCalendarToolbar = ({
  view,
  date,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onDateChange,
  onCreate,
  staffFilterToggle,
}: ScheduleCalendarToolbarProps) => (
  <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 desktop:gap-x-10">
    <div className="flex flex-wrap items-center gap-2">
      <button
        aria-label="前へ"
        className="grid size-11 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
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
        className="grid size-11 place-items-center rounded-8 hover:bg-surface-subtle focus-visible:focus-ring"
        data-testid="calendar-next"
        onClick={onNext}
        type="button"
      >
        <NextIcon height={24} width={24} />
      </button>
      <input
        aria-label="表示する日付"
        className="ml-2 h-11 rounded-8 px-3 text-body-dense ring-1 ring-border-field ring-inset outline-none focus-visible:focus-ring"
        data-testid="calendar-date"
        onChange={(event) => {
          if (event.target.value !== '') onDateChange(event.target.value)
        }}
        type="date"
        value={date}
      />
    </div>
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 desktop:w-auto">
      <div className="w-full desktop:w-48">
        <SegmentedControl
          data-testid="calendar-view"
          label="表示の単位"
          onChange={onViewChange}
          options={VIEW_OPTIONS}
          value={view}
        />
      </div>
      {staffFilterToggle !== undefined && (
        <Button
          aria-controls={staffFilterToggle.controlsId}
          aria-expanded={staffFilterToggle.isOpen}
          aria-haspopup="dialog"
          data-testid="staff-filter-open"
          onClick={staffFilterToggle.onOpen}
          size="S"
          variant="secondary"
        >
          職員の絞り込み
        </Button>
      )}
      {onCreate !== undefined && (
        <Button data-testid="schedule-create-open" onClick={onCreate} size="S">
          予定を作成
        </Button>
      )}
    </div>
  </div>
)
