import { Button, HelpToggle, Loading, RowTable, RowTableRow } from '@buddy/ui'
import type { ReactNode } from 'react'

import type { Department, Team } from '#/api/types'
import { DotLabel } from '#/components/site/StatusBadge'
import { teamColorDotClassName } from '#/components/site/teamDot'

/** 部署とチームの画面の状態。ready の部署とチームは、名前の順に並べたものである。 */
export type OrganizationListViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; departments: readonly Department[]; teams: readonly Team[] }

export type OrganizationListViewProps = {
  state: OrganizationListViewState
  onRetry: () => void
  onCreateDepartment: () => void
  onEditDepartment: (department: Department) => void
  onCreateTeam: () => void
  onEditTeam: (team: Team) => void
}

type UnitSectionProps = {
  kind: 'department' | 'team'
  heading: string
  createLabel: string
  emptyMessage: string
  onCreate: () => void
  rows: readonly { id: string; name: string; label: ReactNode; onEdit: () => void }[]
}

/** 見出しと作るボタンの行と、名前と「編集」を並べた一覧。行が無ければ、一覧の代わりに無いことの文を出す。 */
const UnitSection = ({
  kind,
  heading,
  createLabel,
  emptyMessage,
  onCreate,
  rows,
}: UnitSectionProps) => {
  const prefix = `organization-list-${kind}`
  const headingId = `${prefix}-heading`
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-heading-sm" id={headingId}>
          {heading}
        </h2>
        <Button data-testid={`${prefix}-new`} onClick={onCreate} size="S" variant="secondary">
          {createLabel}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="py-3 text-body text-text-secondary" data-testid={`${prefix}-empty`}>
          {emptyMessage}
        </p>
      ) : (
        <RowTable
          data-testid={`${prefix}-table`}
          metaHeaders={[]}
          primaryHeader="名前"
          trailingHeader="操作"
        >
          {rows.map((row) => (
            <RowTableRow
              action={
                <Button
                  aria-label={`${row.name}を編集`}
                  data-testid={`${prefix}-edit-${row.id}`}
                  onClick={row.onEdit}
                  size="S"
                  variant="secondary"
                >
                  編集
                </Button>
              }
              data-testid={`${prefix}-row-${row.id}`}
              key={row.id}
              meta={[]}
              // 列が名前だけなので、行の名前を太字にしない
              name={<span className="font-normal">{row.label}</span>}
            />
          ))}
        </RowTable>
      )}
    </section>
  )
}

/**
 * 部署とチームの画面の本文。タイトルとヘルプの下に、部署のまとまりとチームのまとまりを縦に並べる。
 * 一覧は詳細を持たないので、行は押せず、行の右端の「編集」で名前と色を変える。チームの名前の前には、チームの色の点を置く。
 */
export const OrganizationListView = ({
  state,
  onRetry,
  onCreateDepartment,
  onEditDepartment,
  onCreateTeam,
  onEditTeam,
}: OrganizationListViewProps) => (
  <div className="flex flex-col gap-6">
    <div className="relative flex items-center gap-1">
      <h1 className="text-heading-md">部署とチーム</h1>
      <HelpToggle data-testid="organization-list-help">
        部署とチームは、職員の登録と詳細で職員に付けます。チームの色は、職員の一覧とカレンダーで、チームの名前の前の点に使います。
      </HelpToggle>
    </div>
    {state.status === 'loading' && (
      <div data-testid="organization-list-loading">
        <Loading description="読み込んでいます" />
      </div>
    )}
    {state.status === 'error' && (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-danger" data-testid="organization-list-error" role="alert">
          {state.message}
        </p>
        <Button
          data-testid="organization-list-retry"
          onClick={onRetry}
          size="S"
          variant="secondary"
        >
          読み直す
        </Button>
      </div>
    )}
    {state.status === 'ready' && (
      <>
        <UnitSection
          createLabel="部署を作る"
          emptyMessage="部署はまだありません。"
          heading="部署"
          kind="department"
          onCreate={onCreateDepartment}
          rows={state.departments.map((d) => ({
            id: d.id,
            name: d.name,
            label: d.name,
            onEdit: () => onEditDepartment(d),
          }))}
        />
        <UnitSection
          createLabel="チームを作る"
          emptyMessage="チームはまだありません。"
          heading="チーム"
          kind="team"
          onCreate={onCreateTeam}
          rows={state.teams.map((t) => ({
            id: t.id,
            name: t.name,
            label: (
              <span data-testid={`organization-list-team-name-${t.id}`}>
                <DotLabel dotClassName={teamColorDotClassName(t.color)}>{t.name}</DotLabel>
              </span>
            ),
            onEdit: () => onEditTeam(t),
          }))}
        />
      </>
    )}
  </div>
)
