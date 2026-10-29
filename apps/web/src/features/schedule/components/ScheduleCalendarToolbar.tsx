import { Button, SegmentedControl } from '@buddy/ui'
import PrevIcon from '#/assets/icons/arrow-left.svg?react'
import NextIcon from '#/assets/icons/arrow-right.svg?react'

import { CALENDAR_VIEWS, CALENDAR_VIEW_LABEL, type CalendarView } from '../constants/calendarView'
import { formatCalendarTitle } from '../lib/calendarRange'

const VIEW_OPTIONS = CALENDAR_VIEWS.map((view) => ({ id: view, label: CALENDAR_VIEW_LABEL[view] }))

export type ScheduleCalendarToolbarProps = {
  view: CalendarView
  /** `YYYY-MM-DD` */
  date: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onViewChange: (view: CalendarView) => void
  /** 渡したときだけ、予定の作成のボタンを出す。 */
  onCreate?: () => void
}

/**
 * カレンダーの上の操作。前後への移動、今日、表示の期間の見出し、表示の種類、予定の作成を並べる。
 * 日付の指定とキャンセルした予定を出す切り替えは、左のサイドバーに置く。
 */
export const ScheduleCalendarToolbar = ({
  view,
  date,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onCreate,
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
      {/* 前後のボタンで期間が変わったことを、スクリーンリーダーに読み上げさせる */}
      <h1 aria-live="polite" className="ml-2 text-heading-md" data-testid="calendar-title">
        {formatCalendarTitle(view, date)}
      </h1>
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
      {onCreate !== undefined && (
        <Button data-testid="schedule-create-open" onClick={onCreate} size="S">
          予定を作成
        </Button>
      )}
    </div>
  </div>
)
