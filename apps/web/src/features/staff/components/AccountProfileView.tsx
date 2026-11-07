import { Avatar, Button, Loading, buttonClassName } from '@buddy/ui'
import type { ReactNode } from 'react'

import type { ExternalCalendar, StaffDetail, StaffPolicy } from '#/api/types'
import { formatLastImport } from '#/components/lastImport'
import { policyTargetText } from '../lib/format'

import { orderPolicies } from '../lib/policyOrder'

/** 読み込みの失敗の文。 */
export const ACCOUNT_PROFILE_LOAD_ERROR_MESSAGE =
  '自分の情報を読み込めませんでした。時間をおいて、読み直してください。'

/** 自分の情報の画面の状態。calendar は、カレンダーが結び付いていなければ null である。 */
export type AccountProfileViewState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      staff: StaffDetail
      calendar: ExternalCalendar | null
      /** 権限の対象の職員とチームの ID から、名前を引く。 */
      targetNames: ReadonlyMap<string, string>
    }

export type AccountProfileViewProps = {
  state: AccountProfileViewState
  /** 職員の管理の権限を持つか。持つときだけ、自分の職員の詳細を開くリンクを出す。 */
  canManageStaff: boolean
  onRetry: () => void
}

/** ログインした職員の、名前、所属、役職、持っている権限、カレンダーの連携の状態を並べる。書き換えの操作は持たない。 */
export const AccountProfileView = ({ state, canManageStaff, onRetry }: AccountProfileViewProps) => (
  <div className="flex max-w-4xl flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-heading-md" data-testid="account-profile-title">
        自分の情報
      </h1>
      {state.status === 'ready' && canManageStaff && (
        <a
          className={buttonClassName({ variant: 'secondary', size: 'S' })}
          data-testid="account-profile-staff-detail"
          href={`/staff/${state.staff.id}`}
        >
          職員の詳細を開く
        </a>
      )}
    </div>
    {state.status === 'loading' && (
      <div data-testid="account-profile-loading">
        <Loading description="読み込んでいます" />
      </div>
    )}
    {state.status === 'error' && (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-danger" data-testid="account-profile-error" role="alert">
          {ACCOUNT_PROFILE_LOAD_ERROR_MESSAGE}
        </p>
        <Button data-testid="account-profile-retry" onClick={onRetry} size="S" variant="secondary">
          読み直す
        </Button>
      </div>
    )}
    {state.status === 'ready' && (
      <>
        <Profile staff={state.staff} />
        <Policies policies={state.staff.policies} targetNames={state.targetNames} />
        <Calendar calendar={state.calendar} />
      </>
    )}
  </div>
)

const panelClassName =
  'flex flex-col gap-4 rounded-8 border border-border bg-surface p-4 desktop:p-5'

/** 項目の名前と値の組。幅 768px 未満では縦に積む。 */
const Fields = ({ rows }: { rows: [label: string, value: ReactNode, testId: string][] }) => (
  <dl className="grid gap-x-4 desktop:grid-cols-[10em_1fr] desktop:gap-y-2">
    {rows.map(([label, value, testId]) => (
      <div className="contents" key={label}>
        <dt className="text-caption text-text-secondary desktop:text-body">{label}</dt>
        <dd className="mb-3 text-body break-all desktop:mb-0" data-testid={testId}>
          {value}
        </dd>
      </div>
    ))}
  </dl>
)

const Profile = ({ staff }: { staff: StaffDetail }) => (
  <section
    aria-label="プロフィール"
    className={panelClassName}
    data-testid="account-profile-profile"
  >
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={staff.username} size="L" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-heading-sm" data-testid="account-profile-name">
          {staff.username}
        </strong>
        {staff.email !== null && (
          <span
            className="text-body break-all text-text-secondary"
            data-testid="account-profile-email"
          >
            {staff.email}
          </span>
        )}
      </div>
    </div>
    <Fields
      rows={[
        ['部署', staff.department.name, 'account-profile-department'],
        ['チーム', staff.team.name, 'account-profile-team'],
        ['役職', staff.position.name, 'account-profile-position'],
      ]}
    />
  </section>
)

const Policies = ({
  policies,
  targetNames,
}: {
  policies: readonly StaffPolicy[]
  targetNames: ReadonlyMap<string, string>
}) => (
  <section
    aria-labelledby="account-profile-policies-title"
    className={panelClassName}
    data-testid="account-profile-policies"
  >
    <h2 className="text-heading-sm" id="account-profile-policies-title">
      持っている権限
    </h2>
    {policies.length === 0 ? (
      <p className="text-body text-text-secondary" data-testid="account-profile-policies-empty">
        持っている権限はありません。
      </p>
    ) : (
      <ul
        className="flex flex-col divide-y divide-border"
        data-testid="account-profile-policy-list"
      >
        {orderPolicies(policies).map((policy) => (
          <li
            className="flex flex-col gap-0.5 py-2 text-body"
            data-testid={`account-profile-policy-${policy.code}`}
            key={policy.user_policy_id}
          >
            {policy.name}
            {policy.target_user_ids.length + policy.target_team_ids.length > 0 && (
              <span
                className="text-caption text-text-secondary"
                data-testid={`account-profile-policy-targets-${policy.code}`}
              >
                {policyTargetText(policy, targetNames)}
              </span>
            )}
          </li>
        ))}
      </ul>
    )}
  </section>
)

const Calendar = ({ calendar }: { calendar: ExternalCalendar | null }) => (
  <section
    aria-labelledby="account-profile-calendar-title"
    className={panelClassName}
    data-testid="account-profile-calendar"
  >
    <h2 className="text-heading-sm" id="account-profile-calendar-title">
      カレンダーの連携
    </h2>
    {calendar === null ? (
      <p
        className="text-body text-text-secondary"
        data-testid="account-profile-calendar-not-linked"
      >
        連携していません。連携は、事業所の管理者に頼んでください。
      </p>
    ) : (
      <Fields
        rows={[
          ['Google カレンダー', calendar.calendar_id, 'account-profile-calendar-id'],
          ...(calendar.last_import === null
            ? []
            : ([
                [
                  '最後の取り込み',
                  formatLastImport(calendar.last_import),
                  'account-profile-last-import',
                ],
              ] as [string, ReactNode, string][])),
        ]}
      />
    )}
  </section>
)
