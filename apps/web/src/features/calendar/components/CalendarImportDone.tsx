import { Button } from '@buddy/ui'

import type { ImportDecision, ImportPreview, ImportResult } from '#/api/types'

import { importedNote, notImportedNote } from '../lib/importSummary'
import { CalendarImportCounts } from './CalendarImportCounts'

export type CalendarImportDoneProps = {
  result: ImportResult
  /** 確定した下見の結果。補足の文の内訳に使う。 */
  preview: ImportPreview
  decisions: readonly ImportDecision[]
  onOpenCalendar: () => void
}

/** 取り込みの結果。取り込んだ、取り込まなかった、取り込み済みの件数と、予定のカレンダーへのボタンを並べる。 */
export const CalendarImportDone = ({
  result,
  preview,
  decisions,
  onOpenCalendar,
}: CalendarImportDoneProps) => (
  <section
    className="flex flex-col items-start gap-5 border-t border-border pt-5"
    data-testid="calendar-import-result"
  >
    <h2 className="text-heading-sm">取り込みました</h2>
    <div className="w-full">
      <CalendarImportCounts
        boxes={[
          {
            key: 'imported',
            label: '取り込んだ',
            count: result.imported_count,
            note: importedNote(preview, decisions),
          },
          {
            key: 'skipped',
            label: '取り込まなかった',
            count: result.skipped_count,
            note: notImportedNote(preview, decisions),
          },
          {
            key: 'already_imported',
            label: '取り込み済み',
            count: result.already_imported_count,
            note: '前の取り込みで取り込んだ予定',
          },
        ]}
        data-testid="calendar-import-result-counts"
      />
    </div>
    <Button data-testid="calendar-import-open-calendar" onClick={onOpenCalendar} size="S">
      予定のカレンダーで見る
    </Button>
  </section>
)
