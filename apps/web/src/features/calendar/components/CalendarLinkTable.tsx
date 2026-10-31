import { ActionMenu, Button, RowTable, RowTableRow } from '@buddy/ui'

import type { ExternalCalendar, Staff } from '#/api/types'

import { formatLastImport } from '../lib/format'

/** 職員の一覧の 1 行。calendar は、結び付けていなければ undefined である。 */
export type CalendarLinkRow = { staff: Staff; calendar?: ExternalCalendar }

export type CalendarLinkTableProps = {
  rows: readonly CalendarLinkRow[]
  /** false なら、結び付けるを押せない。事業所の Google カレンダーの設定が無いときである。 */
  canLink: boolean
  onLink: (staffId: Staff['id']) => void
  onUnlink: (staffId: Staff['id']) => void
  onImport: (staffId: Staff['id']) => void
}

/**
 * 事業所の職員ごとに、結び付けた Google カレンダーと最後の取り込みを並べる表。詳細の画面を持たないので、行は押せない。
 * 行の右端に、結び付けていない職員は「結び付ける」のボタンを、結び付けた職員は取り込むと外すを入れた「…」のメニューを置く。
 * 値の無いセルは空にし、読み上げだけで「結び付けていません」「まだ取り込んでいません」と伝える。
 */
export const CalendarLinkTable = ({
  rows,
  canLink,
  onLink,
  onUnlink,
  onImport,
}: CalendarLinkTableProps) => (
  <RowTable
    data-testid="calendar-link-table"
    metaHeaders={['Google カレンダー', '最後の取り込み']}
    primaryHeader="職員"
    trailingHeader="操作"
  >
    {rows.map(({ staff, calendar }) => (
      <RowTableRow
        action={
          calendar === undefined ? (
            <Button
              data-testid={`calendar-link-open-${staff.id}`}
              disabled={!canLink}
              onClick={() => onLink(staff.id)}
              size="S"
              variant="secondary"
            >
              結び付ける
            </Button>
          ) : (
            <ActionMenu
              data-testid={`calendar-link-menu-${staff.id}`}
              items={[
                {
                  label: '取り込む',
                  onSelect: () => onImport(staff.id),
                  'data-testid': `calendar-link-import-${staff.id}`,
                },
                {
                  label: '外す',
                  onSelect: () => onUnlink(staff.id),
                  'data-testid': `calendar-link-remove-${staff.id}`,
                  isDanger: true,
                },
              ]}
              label={`${staff.name}の操作`}
              menuTestId={`calendar-link-menu-list-${staff.id}`}
            />
          )
        }
        data-testid={`calendar-link-row-${staff.id}`}
        key={staff.id}
        meta={[
          {
            header: 'Google カレンダー',
            value:
              calendar === undefined ? null : (
                <span className="break-all" data-testid={`calendar-link-calendar-id-${staff.id}`}>
                  {calendar.calendar_id}
                </span>
              ),
            emptyLabel: (
              <span data-testid={`calendar-link-calendar-id-${staff.id}`}>結び付けていません</span>
            ),
          },
          {
            header: '最後の取り込み',
            value:
              calendar === undefined || calendar.last_import === null
                ? null
                : formatLastImport(calendar.last_import),
            emptyLabel: 'まだ取り込んでいません',
          },
        ]}
        name={staff.name}
      />
    ))}
  </RowTable>
)
