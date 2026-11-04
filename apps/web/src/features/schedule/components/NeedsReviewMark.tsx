import type { Schedule } from '#/api/types'

/**
 * 確認が必要な Google カレンダーの予定の名前の前に置く「要確認」の印。
 * 色ではなく文字で示す。読み上げでは、予定の時刻と続けて読まないよう「、」で区切る。
 */
export const NeedsReviewMark = ({ scheduleId }: { scheduleId: Schedule['id'] }) => (
  <span className="mr-1 font-bold" data-testid={`schedule-event-${scheduleId}-needs-review`}>
    要確認<span className="sr-only">、</span>
  </span>
)
