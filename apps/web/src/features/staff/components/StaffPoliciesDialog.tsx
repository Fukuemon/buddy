import { clsx } from 'clsx'
import { useState } from 'react'

import type { Policy, Position, StaffDetail } from '#/api/types'
import { InputDialog } from '#/components/site/InputDialog'

import { policyTargetKind } from '../lib/format'
import {
  hasTargetsForAll,
  planPolicyChanges,
  policyOrigin,
  selectionOf,
  type PolicyChange,
  type PolicySelection,
} from '../lib/policyChanges'

/** 権限の対象の候補。 */
export type PolicyTargetOption = { id: string; name: string }

export type StaffPoliciesDialogProps = {
  staff: StaffDetail
  /** 8 つの権限を、権限の一覧と同じ並びで渡す。 */
  policies: readonly Policy[]
  /** 職員の今の役職。付いた理由を出すのに使う。 */
  position?: Position
  /** 職員を対象にする権限の候補。事業所の有効な職員である。 */
  staffOptions: readonly PolicyTargetOption[]
  /** チームを対象にする権限の候補。 */
  teamOptions: readonly PolicyTargetOption[]
  isSubmitting: boolean
  /** 保存できなかったときの文。一部の失敗は、権限ごとの理由を並べる。 */
  errorMessage?: string
  onSubmit: (changes: PolicyChange[]) => void
  onClose: () => void
}

/**
 * 8 つの権限のうち、職員に付けるものと、その対象を選ぶ入力のダイアログ。付いている権限にチェックを入れて始め、
 * 付いた理由の印を名前の右に出す。対象を指定する権限にチェックを入れると、その下に対象のチップを出す。
 * 開いたときから変え、対象を指定する権限の全てに対象を選ぶと保存できる。職員を読み直すと、選択を読み直した権限に合わせる。
 */
export const StaffPoliciesDialog = ({
  staff,
  policies,
  position,
  staffOptions,
  teamOptions,
  isSubmitting,
  errorMessage,
  onSubmit,
  onClose,
}: StaffPoliciesDialogProps) => {
  const [base, setBase] = useState(staff)
  const [selection, setSelection] = useState<PolicySelection>(() => selectionOf(staff, policies))
  if (base !== staff) {
    setBase(staff)
    setSelection(selectionOf(staff, policies))
  }
  const changes = planPolicyChanges(staff, policies, selection)
  const update = (code: string, next: Partial<PolicySelection[string]>) =>
    setSelection((current) => ({ ...current, [code]: { ...current[code], ...next } }))

  return (
    <InputDialog
      busyLabel="保存しています"
      canSubmit={changes.length > 0 && hasTargetsForAll(policies, selection)}
      error={
        errorMessage === undefined
          ? undefined
          : { message: errorMessage, testId: 'staff-policies-error', isBlock: true }
      }
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={() => onSubmit(changes)}
      submitLabel="保存"
      testIdPrefix="staff-policies"
      title="権限を変える"
    >
      <ul className="flex flex-col divide-y divide-border" data-testid="staff-policies-options">
        {policies.map((policy) => {
          const selected = selection[policy.code] ?? { checked: false, targets: [] }
          const owned = staff.policies.find((p) => p.policy_id === policy.id)
          const kind = policyTargetKind(policy)
          const options = kind === 'team' ? teamOptions : staffOptions
          return (
            <li className="flex flex-col gap-2 py-2" key={policy.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body">
                  <input
                    checked={selected.checked}
                    data-testid={`staff-policies-option-${policy.code}`}
                    disabled={isSubmitting}
                    onChange={(event) => update(policy.code, { checked: event.target.checked })}
                    type="checkbox"
                  />
                  {policy.name}
                </label>
                {owned !== undefined && (
                  <span className="text-caption text-text-secondary">
                    {policyOrigin(owned, position)}
                  </span>
                )}
              </div>
              {kind !== undefined && selected.checked && (
                <fieldset
                  className="flex flex-col gap-2 pb-2 pl-6"
                  data-testid="staff-policies-targets"
                >
                  <legend className="mb-1 text-caption text-text-secondary">
                    {kind === 'team' ? '対象のチーム' : '対象の職員'}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {options.map((option) => {
                      const on = selected.targets.includes(option.id)
                      return (
                        <label
                          className={clsx(
                            'flex min-h-11 cursor-pointer items-center rounded-8 px-3 text-body-dense ring-inset has-[:focus-visible]:focus-ring',
                            on ? 'font-bold ring-2 ring-text' : 'ring-1 ring-border-field',
                          )}
                          key={option.id}
                        >
                          <input
                            checked={on}
                            className="sr-only"
                            data-testid={`staff-policies-target-${option.id}`}
                            disabled={isSubmitting}
                            onChange={(event) =>
                              update(policy.code, {
                                targets: event.target.checked
                                  ? [...selected.targets, option.id]
                                  : selected.targets.filter((id) => id !== option.id),
                              })
                            }
                            type="checkbox"
                          />
                          {option.name}
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              )}
            </li>
          )
        })}
      </ul>
    </InputDialog>
  )
}
