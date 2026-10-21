import { Button } from '@buddy/ui'
import type { ReactNode } from 'react'

import type { ExternalCalendar, Staff } from '#/api/types'

import { formatLastImport } from '../lib/format'

/** 職員の一覧の 1 行。calendar は、結び付けていなければ undefined である。 */
export type CalendarLinkRow = { staff: Staff; calendar?: ExternalCalendar }

export type CalendarLinkTableProps = {
  rows: readonly CalendarLinkRow[]
  /** false なら、結び付けるを押せない。サービスアカウントが設定されていないときである。 */
  canLink: boolean
  onLink: (staffId: Staff['id']) => void
  onUnlink: (staffId: Staff['id']) => void
  onImport: (staffId: Staff['id']) => void
}

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <td className="block px-4 py-1 text-body-dense break-all desktop:table-cell desktop:px-5 desktop:py-3">
    <span className="block text-caption text-text-secondary desktop:hidden">{label}</span>
    {children}
  </td>
)

/**
 * 事業所の職員ごとに、結び付けた Google カレンダーと最後の取り込みを並べ、結び付け、外し、取り込みへ移る表。
 * 幅 768px 未満では、行ごとの箱の中に、カラムの名前と値を縦に積む。
 */
export const CalendarLinkTable = ({
  rows,
  canLink,
  onLink,
  onUnlink,
  onImport,
}: CalendarLinkTableProps) => (
  <table className="block w-full border-collapse desktop:table" data-testid="calendar-link-table">
    <thead className="hidden desktop:table-header-group">
      <tr className="border-b border-border">
        <th
          className="px-5 py-2 text-left text-body-dense font-normal text-text-secondary"
          scope="col"
        >
          職員
        </th>
        <th
          className="px-5 py-2 text-left text-body-dense font-normal text-text-secondary"
          scope="col"
        >
          Google カレンダー
        </th>
        <th
          className="px-5 py-2 text-left text-body-dense font-normal text-text-secondary"
          scope="col"
        >
          最後の取り込み
        </th>
        <th className="px-5 py-2" scope="col">
          <span className="sr-only">操作</span>
        </th>
      </tr>
    </thead>
    <tbody className="flex flex-col gap-3 desktop:table-row-group">
      {rows.map(({ staff, calendar }) => (
        <tr
          className="block rounded-8 border border-border py-2 desktop:table-row desktop:rounded-none desktop:border-0 desktop:border-b desktop:py-0"
          data-testid={`calendar-link-row-${staff.id}`}
          key={staff.id}
        >
          <Cell label="職員">{staff.name}</Cell>
          <Cell label="Google カレンダー">
            <span
              className={calendar === undefined ? 'text-text-secondary' : undefined}
              data-testid={`calendar-link-calendar-id-${staff.id}`}
            >
              {calendar?.calendar_id ?? '結び付けていません'}
            </span>
          </Cell>
          <Cell label="最後の取り込み">
            {calendar === undefined ? (
              <span className="text-text-secondary">—</span>
            ) : (
              formatLastImport(calendar.last_import)
            )}
          </Cell>
          <td className="block px-4 py-2 desktop:table-cell desktop:px-5">
            <div className="flex flex-wrap gap-2 desktop:justify-end">
              {calendar === undefined ? (
                <Button
                  data-testid={`calendar-link-open-${staff.id}`}
                  disabled={!canLink}
                  onClick={() => onLink(staff.id)}
                  size="S"
                >
                  結び付ける
                </Button>
              ) : (
                <>
                  <Button
                    data-testid={`calendar-link-import-${staff.id}`}
                    onClick={() => onImport(staff.id)}
                    size="S"
                    variant="secondary"
                  >
                    取り込む
                  </Button>
                  <Button
                    data-testid={`calendar-link-remove-${staff.id}`}
                    onClick={() => onUnlink(staff.id)}
                    size="S"
                    variant="secondary"
                  >
                    外す
                  </Button>
                </>
              )}
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)
