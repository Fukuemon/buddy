import { Button, Loading, SearchBox } from '@buddy/ui'

import type { Department, Position, StaffRecord, Team } from '#/api/types'
import { HelpToggle } from '#/components/site/HelpToggle'
import { FilterSelect, ListCount, ListEmpty, ListTools } from '#/components/site/ListTools'
import { RowTable, RowTableRow } from '#/components/site/RowTable'
import { DotLabel, StatusBadge } from '#/components/site/StatusBadge'
import { teamDotClassName } from '#/components/site/teamDot'

import { STATUS_FILTER_OPTIONS, type StaffListFilter } from '../lib/filter'
import { formatDate, formatDateTimeAsDate, statusLabel, statusTone } from '../lib/format'
import { sortByName } from './StaffFormFields'

/** 職員の一覧の画面の状態。ready の staff は、絞り込んだ後の職員である。 */
export type StaffListViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; staff: readonly StaffRecord[] }

export type StaffListViewProps = {
  state: StaffListViewState
  filter: StaffListFilter
  onFilterChange: (filter: StaffListFilter) => void
  /** 名前の検索と絞り込みを、開いた直後の値に戻す。 */
  onFilterClear: () => void
  /** 絞り込みの選択肢。読み終えるまでは undefined にする。 */
  departments?: readonly Department[]
  teams?: readonly Team[]
  positions?: readonly Position[]
  onRetry: () => void
  onCreate: () => void
}

const unitOptions = (units: readonly { id: string; name: string }[] | undefined) => [
  { value: '', label: 'すべて' },
  ...(sortByName(units) ?? []).map((u) => ({ value: u.id, label: u.name })),
]

/** 状態の絞り込みごとに、一覧に足す列の見出し。有効では足さない。 */
const ASIDE_HEADER: Record<StaffListFilter['status'], string | undefined> = {
  active: undefined,
  on_leave: '戻る予定の日',
  retired: '退職した日',
  all: '状態',
}

/** 状態の絞り込みごとに、一覧に足す列の値。 */
const asideOf = (staff: StaffRecord, status: StaffListFilter['status']) => {
  if (status === 'on_leave')
    return (
      <span data-testid={`staff-list-leave-return-${staff.id}`}>
        {staff.leave_return_date === null
          ? '戻る予定の日なし'
          : `${formatDate(staff.leave_return_date)} に戻る予定`}
      </span>
    )
  if (status === 'retired')
    return (
      <span data-testid={`staff-list-retired-on-${staff.id}`}>
        {staff.retired_at === null ? '退職' : `${formatDateTimeAsDate(staff.retired_at)} に退職`}
      </span>
    )
  if (status === 'all')
    return staff.status === 'active' ? (
      <span />
    ) : (
      <StatusBadge data-testid={`staff-list-status-${staff.id}`} tone={statusTone(staff)}>
        {statusLabel(staff)}
      </StatusBadge>
    )
  return undefined
}

/**
 * 職員の一覧の画面の本文。タイトルとヘルプと職員を登録のボタン、名前の検索と絞り込みと人数の下に、
 * 行全体を押せる職員の表を、チームの順に並べる。休職と退職の絞り込みでは、戻る予定の日と退職した日の列を足す。絞り込みで 0 件なら、表の代わりに絞り込みを外すボタンを出す。
 */
export const StaffListView = ({
  state,
  filter,
  onFilterChange,
  onFilterClear,
  departments,
  teams,
  positions,
  onRetry,
  onCreate,
}: StaffListViewProps) => (
  <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative flex items-center gap-1">
        <h1 className="text-heading-md">職員</h1>
        <HelpToggle data-testid="staff-list-help">
          休職と退職の職員は、ログインできず、予定の担当の候補に出ません。
        </HelpToggle>
      </div>
      <Button data-testid="staff-list-new" onClick={onCreate} size="S">
        職員を登録
      </Button>
    </div>
    {state.status === 'loading' && (
      <div data-testid="staff-list-loading">
        <Loading description="読み込んでいます" />
      </div>
    )}
    {state.status === 'error' && (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-danger" data-testid="staff-list-error" role="alert">
          {state.message}
        </p>
        <Button data-testid="staff-list-retry" onClick={onRetry} size="S" variant="secondary">
          読み直す
        </Button>
      </div>
    )}
    {state.status === 'ready' && (
      <>
        <ListTools>
          <div className="w-full desktop:w-60">
            <SearchBox
              aria-label="名前で検索"
              data-testid="staff-list-search"
              onSearch={(name) => onFilterChange({ ...filter, name })}
              placeholder="名前で検索"
              value={filter.name}
            />
          </div>
          <FilterSelect
            data-testid="staff-list-filter-team"
            disabled={teams === undefined}
            label="チーム"
            onChange={(teamId) => onFilterChange({ ...filter, teamId })}
            options={unitOptions(teams)}
            value={filter.teamId}
          />
          <FilterSelect
            data-testid="staff-list-filter-position"
            disabled={positions === undefined}
            label="役職"
            onChange={(positionId) => onFilterChange({ ...filter, positionId })}
            options={unitOptions(positions)}
            value={filter.positionId}
          />
          <FilterSelect
            data-testid="staff-list-filter-department"
            disabled={departments === undefined}
            label="部署"
            onChange={(departmentId) => onFilterChange({ ...filter, departmentId })}
            options={unitOptions(departments)}
            value={filter.departmentId}
          />
          <FilterSelect
            data-testid="staff-list-filter-status"
            isOn={filter.status !== 'active'}
            label="状態"
            onChange={(status) => onFilterChange({ ...filter, status })}
            options={STATUS_FILTER_OPTIONS}
            value={filter.status}
          />
          <ListCount data-testid="staff-list-count">{state.staff.length} 人</ListCount>
        </ListTools>
        {state.staff.length === 0 ? (
          <ListEmpty
            clearLabel="絞り込みを外す"
            clearTestId="staff-list-filter-clear"
            data-testid="staff-list-empty"
            message="条件に合う職員はいません。"
            onClear={onFilterClear}
          />
        ) : (
          <RowTable
            asideHeader={ASIDE_HEADER[filter.status]}
            data-testid="staff-list-table"
            metaHeaders={['チーム', '役職', '部署']}
            primaryHeader="名前"
          >
            {state.staff.map((s) => (
              <RowTableRow
                aside={asideOf(s, filter.status)}
                data-testid={`staff-list-row-${s.id}`}
                href={`/staff/${s.id}`}
                key={s.id}
                meta={[
                  {
                    header: 'チーム',
                    value: (
                      <DotLabel
                        dotClassName={teamDotClassName(teams ?? [], s.team.id)}
                        dotTestId={`staff-list-team-dot-${s.id}`}
                      >
                        {s.team.name}
                      </DotLabel>
                    ),
                  },
                  { header: '役職', value: s.position.name },
                  { header: '部署', value: s.department.name },
                ]}
                name={s.username}
              />
            ))}
          </RowTable>
        )}
      </>
    )}
  </div>
)
