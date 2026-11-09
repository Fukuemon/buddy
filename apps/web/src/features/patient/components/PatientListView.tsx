import {
  Button,
  FilterSelect,
  HelpToggle,
  ListCount,
  ListEmpty,
  ListTools,
  Loading,
  RowTable,
  RowTableRow,
  SearchBox,
  StatusBadge,
} from '@buddy/ui'

import type { PatientRecord, StaffRecord } from '#/api/types'
import { RefetchErrorMessage } from '#/components/page/RefetchErrorMessage'

import { STATUS_FILTER_OPTIONS, type PatientListFilter } from '../lib/filter'
import { assignedStaffLabel, endedLabel, endedOnText } from '../lib/format'

/** 利用者の一覧の画面の状態。ready の patients は、絞り込んだ後の利用者である。 */
export type PatientListViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      patients: readonly PatientRecord[]
      /** 読み終えた後に読み直して、利用者か職員を読めなかったか。 */
      refetchFailed?: boolean
    }

export type PatientListViewProps = {
  state: PatientListViewState
  filter: PatientListFilter
  onFilterChange: (filter: PatientListFilter) => void
  /** 名前の検索と絞り込みを、開いた直後の値に戻す。 */
  onFilterClear: () => void
  /** 担当の職員の絞り込みの選択肢。読んだ利用者の担当の職員である。 */
  staffOptions: readonly { id: string; name: string }[]
  /** 担当の職員の休職と退職を出すための職員。読み終えるまでは undefined にする。 */
  staffList?: readonly StaffRecord[]
  /** 一度も読めなかったときに、利用者と職員を読み直す。 */
  onRetry: () => void
  /** 読み終えた後に読めなかったデータだけを読み直す。 */
  onRefetch?: () => void
  onCreate: () => void
}

/** 状態の絞り込みごとに、一覧に足す列の見出し。利用中では足さない。 */
const STATUS_HEADER: Record<PatientListFilter['status'], string | undefined> = {
  active: undefined,
  ended: '利用の終了にした日',
  all: '状態',
}

/** 状態の絞り込みごとに、一覧に足す列の値。 */
const statusOf = (patient: PatientRecord, status: PatientListFilter['status']) => {
  if (status === 'ended' && patient.ended_at !== null)
    return (
      <span data-testid={`patient-list-ended-on-${patient.id}`}>
        {endedOnText(patient.ended_at)}
      </span>
    )
  if (status === 'all') {
    const label = endedLabel(patient)
    return label === undefined ? (
      <span />
    ) : (
      <StatusBadge data-testid={`patient-list-status-${patient.id}`} tone="muted">
        {label}
      </StatusBadge>
    )
  }
  return undefined
}

/**
 * 利用者の一覧の画面の本文。タイトルとヘルプと利用者を登録のボタン、名前の検索と絞り込みと人数の下に、
 * 行全体を押せる利用者の表を名前の順に並べる。利用の終了の絞り込みでは利用の終了にした日の列を、すべてでは状態の列を足す。
 * 絞り込みで 0 件なら、表の代わりに絞り込みを外すボタンを出す。
 */
export const PatientListView = ({
  state,
  filter,
  onFilterChange,
  onFilterClear,
  staffOptions,
  staffList,
  onRetry,
  onRefetch,
  onCreate,
}: PatientListViewProps) => (
  <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative flex items-center gap-1">
        <h1 className="text-heading-md">利用者</h1>
        <HelpToggle data-testid="patient-list-help">
          利用の終了の利用者は、予定の利用者の候補に出ません。
        </HelpToggle>
      </div>
      <Button data-testid="patient-list-new" onClick={onCreate} size="S">
        利用者を登録
      </Button>
    </div>
    {state.status === 'loading' && (
      <div data-testid="patient-list-loading">
        <Loading description="読み込んでいます" />
      </div>
    )}
    {state.status === 'error' && (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-danger" data-testid="patient-list-error" role="alert">
          {state.message}
        </p>
        <Button data-testid="patient-list-retry" onClick={onRetry} size="S" variant="secondary">
          読み直す
        </Button>
      </div>
    )}
    {state.status === 'ready' && (
      <>
        {state.refetchFailed === true && onRefetch !== undefined && (
          <RefetchErrorMessage onRetry={onRefetch} />
        )}
        <ListTools>
          <div className="w-full desktop:w-60">
            <SearchBox
              aria-label="名前で検索"
              data-testid="patient-list-search"
              onSearch={(name) => onFilterChange({ ...filter, name })}
              placeholder="名前で検索"
              value={filter.name}
            />
          </div>
          <FilterSelect
            data-testid="patient-list-filter-staff"
            label="担当の職員"
            onChange={(staffId) => onFilterChange({ ...filter, staffId })}
            options={[
              { value: '', label: 'すべて' },
              ...staffOptions.map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={filter.staffId}
          />
          <FilterSelect
            data-testid="patient-list-filter-status"
            isOn={filter.status !== 'active'}
            label="状態"
            onChange={(status) => onFilterChange({ ...filter, status })}
            options={STATUS_FILTER_OPTIONS}
            value={filter.status}
          />
          <ListCount data-testid="patient-list-count">{state.patients.length} 人</ListCount>
        </ListTools>
        {state.patients.length === 0 ? (
          <ListEmpty
            clearLabel="絞り込みを外す"
            clearTestId="patient-list-filter-clear"
            data-testid="patient-list-empty"
            message="条件に合う利用者はいません。"
            onClear={onFilterClear}
          />
        ) : (
          <RowTable
            data-testid="patient-list-table"
            metaHeaders={['担当の職員', 'サービス', '希望の時間帯', '希望する担当の性別']}
            primaryHeader="名前"
            statusHeader={STATUS_HEADER[filter.status]}
          >
            {state.patients.map((p) => (
              <RowTableRow
                data-testid={`patient-list-row-${p.id}`}
                href={`/patients/${p.id}`}
                key={p.id}
                meta={[
                  { header: '担当の職員', value: assignedStaffLabel(p, staffList) },
                  { header: 'サービス', value: p.service_code },
                  { header: '希望の時間帯', value: p.preferred_time },
                  { header: '希望する担当の性別', value: p.preferred_gender },
                ]}
                name={p.name}
                status={statusOf(p, filter.status)}
              />
            ))}
          </RowTable>
        )}
      </>
    )}
  </div>
)
