import { ActionMenu, type ActionMenuItem, Avatar, Button, Loading, StatusBadge } from '@buddy/ui'
import { clsx } from 'clsx'
import { useId, useState, type ReactNode } from 'react'

import type { Policy, Position, StaffDetail } from '#/api/types'

import {
  employmentText,
  policyTargetKind,
  policyTargetText,
  statusLabel,
  statusTone,
} from '../lib/format'
import { groupPolicies } from '../lib/policyChanges'

/** 職員の詳細の画面の状態。canRetry は、職員が見つからなかったときに false にする。 */
export type StaffDetailViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string; canRetry: boolean }
  | { status: 'ready'; staff: StaffDetail }

export type StaffDetailViewProps = {
  state: StaffDetailViewState
  onRetry: () => void
  /** ログインした職員の詳細か。自分は休職と退職にできないので、「…」のメニューを出さない。 */
  isSelf: boolean
  /** 全ての権限を、権限の一覧の並びで渡す。読み終えるまでは undefined にする。 */
  policies?: readonly Policy[]
  /** 職員の今の役職。付いた理由を出すのに使う。 */
  position?: Position
  /** 権限の対象の、職員とチームの ID から名前を引く表。 */
  targetNames: ReadonlyMap<string, string>
  onEdit: () => void
  onChangePosition: () => void
  onChangePolicies: () => void
  onLeave: () => void
  onRetire: () => void
  /** 復職にする。送った結果が返るまで「…」のメニューを開いたままにするので、送る処理の Promise を返す。 */
  onReinstate: () => Promise<unknown>
  isReinstating: boolean
  /** 復職にできなかったときの文。 */
  reinstateErrorMessage?: string
}

/**
 * 職員の詳細の画面の本文。職員の一覧へのリンク、職員の見出し（頭文字の丸、名前、状態の印、メールアドレス、編集と「…」）、
 * プロフィールと権限のタブを並べる。退職した職員では、変える操作を出さない。
 */
export const StaffDetailView = (props: StaffDetailViewProps) => {
  const { state, onRetry } = props
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <a
        className="inline-flex min-h-11 items-center self-start rounded-8 text-label text-primary underline underline-offset-4 focus-visible:focus-ring"
        data-testid="staff-detail-back"
        href="/staff"
      >
        ← 職員の一覧
      </a>
      {state.status === 'loading' && (
        <div data-testid="staff-detail-loading">
          <Loading description="読み込んでいます" />
        </div>
      )}
      {state.status === 'error' && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body text-danger" data-testid="staff-detail-error" role="alert">
            {state.message}
          </p>
          {state.canRetry && (
            <Button data-testid="staff-detail-retry" onClick={onRetry} size="S" variant="secondary">
              読み直す
            </Button>
          )}
        </div>
      )}
      {state.status === 'ready' && <StaffDetailBody {...props} staff={state.staff} />}
    </div>
  )
}

const StaffDetailBody = ({
  staff,
  isSelf,
  policies,
  position,
  targetNames,
  onEdit,
  onChangePosition,
  onChangePolicies,
  onLeave,
  onRetire,
  onReinstate,
  isReinstating,
  reinstateErrorMessage,
}: StaffDetailViewProps & { staff: StaffDetail }) => {
  const tabsId = useId()
  const [tab, setTab] = useState<'profile' | 'policies'>('profile')
  const canChange = staff.status !== 'retired'
  const menuItems: ActionMenuItem[] =
    staff.status === 'on_leave'
      ? [
          {
            label: isReinstating ? '復職にしています' : '復職にする',
            onSelect: onReinstate,
            disabled: isReinstating,
            'data-testid': 'staff-detail-reinstate',
            staysOpenUntilSettled: true,
          },
          {
            label: '退職にする',
            onSelect: onRetire,
            isDanger: true,
            'data-testid': 'staff-detail-retire',
          },
        ]
      : [
          { label: '休職にする', onSelect: onLeave, 'data-testid': 'staff-detail-leave' },
          {
            label: '退職にする',
            onSelect: onRetire,
            isDanger: true,
            'data-testid': 'staff-detail-retire',
          },
        ]
  const tabs = [
    { id: 'profile', label: 'プロフィール' },
    { id: 'policies', label: '権限' },
  ] as const

  return (
    <>
      <div className="flex flex-col gap-3 desktop:flex-row desktop:items-center">
        <div className="flex min-w-0 grow items-center gap-3">
          <Avatar isMuted={staff.status === 'retired'} name={staff.username} size="L" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-heading-md" data-testid="staff-detail-name">
                {staff.username}
              </h1>
              {staff.status !== 'active' && (
                <StatusBadge data-testid="staff-detail-status" tone={statusTone(staff)}>
                  {statusLabel(staff)}
                </StatusBadge>
              )}
            </div>
            {staff.email !== null && (
              <span
                className="text-body break-all text-text-secondary"
                data-testid="staff-detail-email"
              >
                {staff.email}
              </span>
            )}
          </div>
        </div>
        {canChange && (
          <div className="flex items-center gap-2">
            <Button data-testid="staff-detail-edit" onClick={onEdit} size="S" variant="secondary">
              編集
            </Button>
            {!isSelf && (
              <ActionMenu data-testid="staff-detail-menu" items={menuItems} label="ほかの操作" />
            )}
          </div>
        )}
      </div>
      {reinstateErrorMessage !== undefined && (
        <p
          className="border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger"
          data-testid="staff-detail-reinstate-error"
          role="alert"
        >
          {reinstateErrorMessage}
        </p>
      )}
      <div
        className="inline-flex gap-0.5 self-start rounded-8 border border-border bg-surface-subtle p-0.5"
        data-testid="staff-detail-tabs"
        role="tablist"
      >
        {tabs.map(({ id, label }) => (
          <button
            aria-controls={`${tabsId}-${id}`}
            aria-selected={tab === id}
            className={clsx(
              'min-h-11 rounded-6 px-4 text-label focus-visible:focus-ring',
              tab === id ? 'bg-surface font-bold text-text' : 'text-text-secondary',
            )}
            data-testid={`staff-detail-tab-${id}`}
            id={`${tabsId}-${id}-tab`}
            key={id}
            onClick={() => setTab(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'profile' ? (
        <section
          aria-labelledby={`${tabsId}-profile-tab`}
          className="rounded-8 border border-border bg-surface p-4 desktop:p-5"
          data-testid="staff-detail-profile"
          id={`${tabsId}-profile`}
          role="tabpanel"
        >
          <ProfileList canChange={canChange} onChangePosition={onChangePosition} staff={staff} />
        </section>
      ) : (
        <section
          aria-labelledby={`${tabsId}-policies-tab`}
          className="flex flex-col gap-4 rounded-8 border border-border bg-surface p-4 desktop:p-5"
          data-testid="staff-detail-policies"
          id={`${tabsId}-policies`}
          role="tabpanel"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-heading-sm">権限</h2>
            {canChange && (
              <Button
                data-testid="staff-detail-policies-change"
                disabled={policies === undefined}
                onClick={onChangePolicies}
                size="S"
                variant="secondary"
              >
                権限を変える
              </Button>
            )}
          </div>
          {policies === undefined ? (
            <Loading description="読み込んでいます" />
          ) : (
            <PolicyList
              policies={policies}
              position={position}
              staff={staff}
              targetNames={targetNames}
            />
          )}
        </section>
      )}
    </>
  )
}

const ProfileList = ({
  staff,
  canChange,
  onChangePosition,
}: {
  staff: StaffDetail
  canChange: boolean
  onChangePosition: () => void
}) => {
  const employment = employmentText(staff)
  const rows: [string, ReactNode][] = [
    ...(staff.phone_number !== null && staff.status !== 'retired'
      ? ([['電話番号', staff.phone_number]] as [string, ReactNode][])
      : []),
    ['部署', staff.department.name],
    ['チーム', staff.team.name],
    [
      '訪問',
      <span data-testid="staff-detail-visits" key="visits">
        {staff.visits
          ? '訪問する'
          : '訪問しない（予定のカレンダーの列と、予定と担当の候補に出ません）'}
      </span>,
    ],
    [
      '役職',
      <span className="flex flex-wrap items-center gap-x-3" key="position">
        <span data-testid="staff-detail-position-name">{staff.position.name}</span>
        {canChange && (
          <button
            className="min-h-11 text-label text-primary underline underline-offset-4 focus-visible:focus-ring"
            data-testid="staff-detail-position-change"
            onClick={onChangePosition}
            type="button"
          >
            役職を変える
          </button>
        )}
      </span>,
    ],
    ...(employment === undefined
      ? []
      : ([
          [
            '在籍',
            <span data-testid="staff-detail-status-text" key="status">
              {employment}
            </span>,
          ],
        ] as [string, ReactNode][])),
  ]
  return (
    <dl className="grid gap-x-4 desktop:grid-cols-[8em_1fr] desktop:gap-y-2">
      {rows.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-caption text-text-secondary desktop:flex desktop:min-h-11 desktop:items-center desktop:text-body">
            {label}
          </dt>
          <dd className="mb-3 flex min-h-11 items-center text-body break-all desktop:mb-0">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** 付いている権限を、役職で付く権限と個別に足した権限のまとまりに分け、対象を指定する権限には対象を添える。 */
const PolicyList = ({
  staff,
  policies,
  position,
  targetNames,
}: {
  staff: StaffDetail
  policies: readonly Policy[]
  position?: Position
  targetNames: ReadonlyMap<string, string>
}) => {
  const owned = policies.filter((policy) => staff.policies.some((p) => p.policy_id === policy.id))
  if (owned.length === 0)
    return (
      <p
        className="px-4 py-8 text-center text-body text-text-secondary"
        data-testid="staff-policy-list"
      >
        付いている権限はありません。
      </p>
    )
  const groups = groupPolicies(owned, position)
  return (
    <div className="flex flex-col gap-5" data-testid="staff-policy-list">
      {[
        {
          id: 'position',
          title: `役職「${staff.position.name}」で付く権限`,
          items: groups.position,
        },
        { id: 'individual', title: '個別に足した権限', items: groups.other },
      ]
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section
            aria-labelledby={`staff-policy-group-${group.id}-title`}
            className="flex flex-col gap-1"
            data-testid={`staff-policy-group-${group.id}`}
            key={group.id}
          >
            <h3
              className="text-label text-text-secondary"
              id={`staff-policy-group-${group.id}-title`}
            >
              {group.title}
            </h3>
            <ul className="flex flex-col divide-y divide-border">
              {group.items.map((policy) => {
                const grant = staff.policies.find((p) => p.policy_id === policy.id)
                return (
                  <li
                    className="flex flex-col gap-0.5 py-2 text-body"
                    data-testid={`staff-policy-row-${policy.code}`}
                    key={policy.id}
                  >
                    {policy.name}
                    {grant !== undefined &&
                      policyTargetKind(policy) !== undefined &&
                      grant.target_user_ids.length + grant.target_team_ids.length > 0 && (
                        <span
                          className="text-caption text-text-secondary"
                          data-testid={`staff-policy-targets-${policy.code}`}
                        >
                          {policyTargetText(grant, targetNames)}
                        </span>
                      )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
    </div>
  )
}
