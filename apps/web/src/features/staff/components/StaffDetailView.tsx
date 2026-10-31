import { Button, Loading } from '@buddy/ui'
import type { ReactNode } from 'react'

import type { StaffDetail, StaffPolicy } from '#/api/types'
import { BusyLabel } from '#/components/site/BusyLabel'

import { employmentText, policyTargetText } from '../lib/format'
import { StaffStatusBadge } from './StaffStatusBadge'

/** 職員の詳細の画面の状態。canRetry は、職員が見つからなかったときに false にする。 */
export type StaffDetailViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string; canRetry: boolean }
  | { status: 'ready'; staff: StaffDetail }

export type StaffDetailViewProps = {
  state: StaffDetailViewState
  onRetry: () => void
  /** ログインした職員の詳細か。自分は休職と退職にできない。 */
  isSelf: boolean
  /** 権限の対象の、職員とチームの ID から名前を引く表。 */
  targetNames: ReadonlyMap<string, string>
  /** 基本の情報の編集の間、基本の情報の枠の代わりに出す入力の欄。 */
  profileEditor?: ReactNode
  onEdit: () => void
  onChangePosition: () => void
  /** false なら、権限を足すを押せない。職員が全ての権限を持つときである。 */
  canAddPolicy: boolean
  onAddPolicy: () => void
  onRemovePolicy: (userPolicyId: StaffPolicy['user_policy_id']) => void
  /** 外すのを送っている権限。 */
  removingPolicyId?: StaffPolicy['user_policy_id']
  /** 権限を外せなかったときの文。権限の一覧の上に出す。 */
  policyErrorMessage?: string
  onLeave: () => void
  onRetire: () => void
  onReinstate: () => void
  isReinstating: boolean
  /** 復職にできなかったときの文。 */
  reinstateErrorMessage?: string
}

const Section = ({
  title,
  action,
  children,
  'data-testid': testId,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  'data-testid': string
}) => (
  <section
    className="flex flex-col gap-4 rounded-8 border border-border bg-surface p-4 desktop:p-5"
    data-testid={testId}
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-heading-sm">{title}</h2>
      {action}
    </div>
    {children}
  </section>
)

const ProfileList = ({ staff }: { staff: StaffDetail }) => {
  const erased = staff.status === 'retired' ? 'なし（退職で消しました）' : 'なし'
  const rows: [string, string, string?][] = [
    ['名前', staff.username],
    ['メールアドレス', staff.email ?? erased, 'staff-detail-email'],
    ['電話番号', staff.phone_number ?? erased],
    ['部署', staff.department.name],
    ['チーム', staff.team.name],
  ]
  return (
    <dl className="grid gap-x-4 gap-y-0.5 desktop:grid-cols-[10em_1fr] desktop:gap-y-2">
      {rows.map(([label, value, testId]) => (
        <div className="contents" key={label}>
          <dt className="text-body text-text-secondary">{label}</dt>
          <dd className="mb-2 text-body break-all desktop:mb-0" data-testid={testId}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const PolicyTable = ({
  staff,
  targetNames,
  canChange,
  onRemove,
  removingPolicyId,
}: {
  staff: StaffDetail
  targetNames: ReadonlyMap<string, string>
  canChange: boolean
  onRemove: (userPolicyId: string) => void
  removingPolicyId?: string
}) => {
  const policies = [...staff.policies].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  if (policies.length === 0)
    return <p className="text-body text-text-secondary">権限はありません。</p>
  return (
    <table className="block w-full border-collapse desktop:table" data-testid="staff-policy-table">
      <thead className="hidden desktop:table-header-group">
        <tr className="border-b border-border">
          <th
            className="px-3 py-2 text-left text-body-dense font-normal text-text-secondary"
            scope="col"
          >
            権限
          </th>
          <th
            className="px-3 py-2 text-left text-body-dense font-normal text-text-secondary"
            scope="col"
          >
            対象
          </th>
          <th className="px-3 py-2" scope="col">
            <span className="sr-only">操作</span>
          </th>
        </tr>
      </thead>
      <tbody className="flex flex-col gap-3 desktop:table-row-group">
        {policies.map((policy) => (
          <tr
            className="block rounded-8 border border-border py-2 desktop:table-row desktop:rounded-none desktop:border-0 desktop:border-b desktop:py-0"
            data-testid={`staff-policy-row-${policy.user_policy_id}`}
            key={policy.user_policy_id}
          >
            <td className="block px-3 py-1 text-body-dense desktop:table-cell desktop:py-3">
              <span className="block text-caption text-text-secondary desktop:hidden">権限</span>
              {policy.name}
            </td>
            <td className="block px-3 py-1 text-body-dense desktop:table-cell desktop:py-3">
              <span className="block text-caption text-text-secondary desktop:hidden">対象</span>
              <span
                className={
                  policy.target_user_ids.length + policy.target_team_ids.length === 0
                    ? 'text-text-secondary'
                    : undefined
                }
              >
                {policyTargetText(policy, targetNames)}
              </span>
            </td>
            <td className="block px-3 py-1 desktop:table-cell desktop:text-right">
              {canChange && (
                <Button
                  data-testid={`staff-policy-remove-${policy.user_policy_id}`}
                  disabled={removingPolicyId !== undefined}
                  onClick={() => onRemove(policy.user_policy_id)}
                  size="S"
                  variant="secondary"
                >
                  <BusyLabel busy={removingPolicyId === policy.user_policy_id}>外す</BusyLabel>
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ErrorNote = ({ message, testId }: { message: string; testId: string }) => (
  <p
    className="border-l-4 border-danger bg-danger-surface px-3 py-2 text-body text-danger"
    data-testid={testId}
    role="alert"
  >
    {message}
  </p>
)

/**
 * 職員の詳細の画面の本文。職員の一覧へのリンク、名前と状態の印の下に、基本の情報、役職、権限、在籍の枠を並べる。
 * 退職した職員では、変える操作のボタンを出さない。自分の詳細では、休職にすると退職にするを出さない。
 */
export const StaffDetailView = (props: StaffDetailViewProps) => {
  const { state, onRetry } = props
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <a
        className="inline-flex min-h-11 items-center self-start rounded-8 px-2 text-label text-primary underline underline-offset-4 focus-visible:focus-ring"
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
  targetNames,
  profileEditor,
  onEdit,
  onChangePosition,
  canAddPolicy,
  onAddPolicy,
  onRemovePolicy,
  removingPolicyId,
  policyErrorMessage,
  onLeave,
  onRetire,
  onReinstate,
  isReinstating,
  reinstateErrorMessage,
}: StaffDetailViewProps & { staff: StaffDetail }) => {
  const canChange = staff.status !== 'retired'
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-heading-md" data-testid="staff-detail-name">
          {staff.username}
        </h1>
        <StaffStatusBadge data-testid="staff-detail-status" staff={staff} />
      </div>
      {profileEditor === undefined ? (
        <Section
          action={
            canChange && (
              <Button data-testid="staff-detail-edit" onClick={onEdit} size="S" variant="secondary">
                編集
              </Button>
            )
          }
          data-testid="staff-detail-profile"
          title="基本の情報"
        >
          <ProfileList staff={staff} />
        </Section>
      ) : (
        <section className="rounded-8 border border-border bg-surface p-4 desktop:p-5">
          {profileEditor}
        </section>
      )}
      <Section
        action={
          canChange && (
            <Button
              data-testid="staff-detail-position-change"
              onClick={onChangePosition}
              size="S"
              variant="secondary"
            >
              役職を変える
            </Button>
          )
        }
        data-testid="staff-detail-position"
        title="役職"
      >
        <p className="text-body" data-testid="staff-detail-position-name">
          {staff.position.name}
        </p>
      </Section>
      <Section
        action={
          canChange && (
            <Button
              data-testid="staff-policy-add"
              disabled={!canAddPolicy}
              onClick={onAddPolicy}
              size="S"
              variant="secondary"
            >
              権限を足す
            </Button>
          )
        }
        data-testid="staff-detail-policies"
        title="権限"
      >
        {policyErrorMessage !== undefined && (
          <ErrorNote message={policyErrorMessage} testId="staff-policy-error" />
        )}
        <PolicyTable
          canChange={canChange}
          onRemove={onRemovePolicy}
          removingPolicyId={removingPolicyId}
          staff={staff}
          targetNames={targetNames}
        />
      </Section>
      <Section data-testid="staff-detail-employment" title="在籍">
        <p className="text-body" data-testid="staff-detail-status-text">
          {employmentText(staff)}
        </p>
        {reinstateErrorMessage !== undefined && (
          <ErrorNote message={reinstateErrorMessage} testId="staff-detail-reinstate-error" />
        )}
        {canChange && (
          <div className="flex flex-wrap gap-3">
            {staff.status === 'on_leave' && (
              <Button
                data-testid="staff-detail-reinstate"
                disabled={isReinstating}
                onClick={onReinstate}
                size="S"
              >
                <BusyLabel busy={isReinstating}>
                  {isReinstating ? '復職にしています' : '復職にする'}
                </BusyLabel>
              </Button>
            )}
            {staff.status === 'active' && !isSelf && (
              <Button
                data-testid="staff-detail-leave"
                onClick={onLeave}
                size="S"
                variant="secondary"
              >
                休職にする
              </Button>
            )}
            {!isSelf && (
              <Button
                data-testid="staff-detail-retire"
                onClick={onRetire}
                size="S"
                variant="destructive"
              >
                退職にする
              </Button>
            )}
          </div>
        )}
      </Section>
    </>
  )
}
