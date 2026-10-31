import { Button, Loading, SearchBox } from '@buddy/ui'

import type { Department, Position, StaffRecord, Team } from '#/api/types'
import { HelpToggle } from '#/components/site/HelpToggle'
import { FilterSelect, ListCount, ListEmpty, ListTools } from '#/components/site/ListTools'
import { RowTable, RowTableRow } from '#/components/site/RowTable'
import { Avatar, StatusBadge } from '#/components/site/StatusBadge'

import { STATUS_FILTER_OPTIONS, type StaffListFilter } from '../lib/filter'
import { statusLabel, statusTone } from '../lib/format'
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

/**
 * 職員の一覧の画面の本文。タイトルとヘルプと職員を登録のボタン、名前の検索と絞り込みと人数の下に、
 * 行全体を押せる職員の表を並べる。絞り込みで 0 件なら、表の代わりに絞り込みを外すボタンを出す。
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
            data-testid="staff-list-filter-department"
            disabled={departments === undefined}
            label="部署"
            onChange={(departmentId) => onFilterChange({ ...filter, departmentId })}
            options={unitOptions(departments)}
            value={filter.departmentId}
          />
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
            data-testid="staff-list-filter-status"
            isOn
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
            data-testid="staff-list-table"
            metaHeaders={['部署', 'チーム', '役職']}
            primaryHeader="名前"
            statusHeader="状態"
          >
            {state.staff.map((s) => (
              <RowTableRow
                data-testid={`staff-list-row-${s.id}`}
                href={`/staff/${s.id}`}
                key={s.id}
                leading={<Avatar isMuted={s.status === 'retired'} name={s.username} />}
                meta={[
                  { header: '部署', value: s.department.name },
                  { header: 'チーム', value: s.team.name },
                  { header: '役職', value: s.position.name },
                ]}
                name={s.username}
                status={
                  <StatusBadge data-testid={`staff-list-status-${s.id}`} tone={statusTone(s)}>
                    {statusLabel(s)}
                  </StatusBadge>
                }
                subtext={s.email ?? 'メールアドレスなし'}
              />
            ))}
          </RowTable>
        )}
      </>
    )}
  </div>
)
