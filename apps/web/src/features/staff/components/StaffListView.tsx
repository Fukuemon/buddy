import { Button, Loading } from '@buddy/ui'
import type { ReactNode } from 'react'

import type { StaffRecord } from '#/api/types'

import { StaffStatusBadge } from './StaffStatusBadge'

/** 職員の一覧の画面の状態。 */
export type StaffListViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; staff: readonly StaffRecord[] }

export type StaffListViewProps = {
  state: StaffListViewState
  onRetry: () => void
  onCreate: () => void
}

const headerClassName = 'px-5 py-2 text-left text-body-dense font-normal text-text-secondary'

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <td className="block px-4 py-1 text-body-dense break-all desktop:table-cell desktop:px-5 desktop:py-3">
    <span className="block text-caption text-text-secondary desktop:hidden">{label}</span>
    {children}
  </td>
)

const StaffTable = ({ staff }: { staff: readonly StaffRecord[] }) => (
  <table className="block w-full border-collapse desktop:table" data-testid="staff-list-table">
    <thead className="hidden desktop:table-header-group">
      <tr className="border-b border-border">
        {['名前', '部署', 'チーム', '役職', '状態'].map((label) => (
          <th className={headerClassName} key={label} scope="col">
            {label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="flex flex-col gap-3 desktop:table-row-group">
      {staff.map((s) => (
        <tr
          className="block rounded-8 border border-border bg-surface py-2 desktop:table-row desktop:rounded-none desktop:border-0 desktop:border-b desktop:py-0"
          data-testid={`staff-list-row-${s.id}`}
          key={s.id}
        >
          <Cell label="名前">
            <a
              className="inline-flex min-h-11 items-center rounded-8 text-primary underline underline-offset-4 focus-visible:focus-ring"
              data-testid={`staff-list-open-${s.id}`}
              href={`/staff/${s.id}`}
            >
              {s.username}
            </a>
          </Cell>
          <Cell label="部署">{s.department.name}</Cell>
          <Cell label="チーム">{s.team.name}</Cell>
          <Cell label="役職">{s.position.name}</Cell>
          <Cell label="状態">
            <StaffStatusBadge data-testid={`staff-list-status-${s.id}`} staff={s} />
          </Cell>
        </tr>
      ))}
    </tbody>
  </table>
)

/**
 * 職員の一覧の画面の本文。タイトルと職員を登録のボタン、説明の文の下に、職員の表を並べる。
 * 幅 768px 未満では、表の行を、カラムの名前と値を縦に積んだ箱にする。
 */
export const StaffListView = ({ state, onRetry, onCreate }: StaffListViewProps) => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-heading-md">職員</h1>
      <Button data-testid="staff-list-new" onClick={onCreate} size="S">
        職員を登録
      </Button>
    </div>
    <p className="max-w-3xl text-body">
      事業所の職員を登録し、役職、権限、休職、復職、退職を変えます。休職と退職の職員は、ログインできず、予定の担当の候補に出ません。
    </p>
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
    {state.status === 'ready' && <StaffTable staff={state.staff} />}
  </div>
)
