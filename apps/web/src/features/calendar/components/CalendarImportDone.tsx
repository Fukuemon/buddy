import { Button } from '@buddy/ui'

import type { ImportResult } from '#/api/types'

import { nonZeroBoxes } from '../lib/importSummary'
import { CalendarImportCounts } from './CalendarImportCounts'

export type CalendarImportDoneProps = {
  result: ImportResult
  onOpenCalendar: () => void
  /**
   * 予定の管理の移行の取り込みのときに渡す。渡すと、予定のカレンダーへのボタンの代わりに、移行の状況へのボタンを出す。
   * 移行の間は、予定のカレンダーが Google カレンダーの写しを出し、取り込んだ予定を出さないためである。
   */
  onBackToCutover?: () => void
}

/**
 * 取り込みの結果。見出しと、取り込んだ、取り込まなかった、取り込み済みの件数と、予定のカレンダーへのボタンを並べる。
 * 件数が 0 の箱は出さない。
 */
export const CalendarImportDone = ({
  result,
  onOpenCalendar,
  onBackToCutover,
}: CalendarImportDoneProps) => (
  <section
    className="flex flex-col items-start gap-5 border-t border-border pt-5"
    data-testid="calendar-import-result"
  >
    <h2 className="text-heading-sm">取り込みました</h2>
    <div className="w-full">
      <CalendarImportCounts
        boxTestIdPrefix="calendar-import-result-count-"
        boxes={nonZeroBoxes([
          { key: 'imported', label: '取り込んだ', count: result.imported_count, note: '' },
          { key: 'skipped', label: '取り込まなかった', count: result.skipped_count, note: '' },
          {
            key: 'already_imported',
            label: '取り込み済み',
            count: result.already_imported_count,
            note: '',
          },
        ])}
        data-testid="calendar-import-result-counts"
      />
    </div>
    {onBackToCutover !== undefined ? (
      <Button data-testid="calendar-import-back-to-cutover" onClick={onBackToCutover} size="S">
        移行の状況に戻る
      </Button>
    ) : (
      <Button data-testid="calendar-import-open-calendar" onClick={onOpenCalendar} size="S">
        予定のカレンダーで見る
      </Button>
    )}
  </section>
)
