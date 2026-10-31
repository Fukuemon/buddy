import { useState } from 'react'

import type { Policy, StaffDetail, StaffPolicyInput } from '#/api/types'

import { policyTargetKind } from '../lib/format'
import { StaffDialogFrame } from './StaffDialogFrame'

/** 権限の対象の候補。 */
export type PolicyTargetOption = { id: string; name: string }

export type StaffPolicyAddDialogProps = {
  staff: StaffDetail
  /** 8 つの権限。読み終えるまでは undefined にする。 */
  policies?: readonly Policy[]
  /** 職員を対象にする権限の候補。事業所の有効な職員である。 */
  staffOptions: readonly PolicyTargetOption[]
  /** チームを対象にする権限の候補。 */
  teamOptions: readonly PolicyTargetOption[]
  isSubmitting: boolean
  errorMessage?: string
  onSubmit: (input: StaffPolicyInput) => void
  onCancel: () => void
}

/**
 * 職員に権限を 1 つ足すダイアログ。職員が持つ権限は選べない。
 * 対象を指定する権限を選ぶと、職員かチームのチェックボックスを出し、1 つ以上選ぶと足せる。
 */
export const StaffPolicyAddDialog = ({
  staff,
  policies,
  staffOptions,
  teamOptions,
  isSubmitting,
  errorMessage,
  onSubmit,
  onCancel,
}: StaffPolicyAddDialogProps) => {
  const [policyId, setPolicyId] = useState<string>()
  const [targets, setTargets] = useState<string[]>([])
  const owned = new Set(staff.policies.map((p) => p.policy_id))
  const policy = policies?.find((p) => p.id === policyId)
  const kind = policy === undefined ? undefined : policyTargetKind(policy)
  const options = kind === 'team' ? teamOptions : staffOptions

  return (
    <StaffDialogFrame
      busyLabel="足しています"
      canSubmit={policy !== undefined && (kind === undefined || targets.length > 0)}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      onCancel={onCancel}
      onSubmit={() => {
        if (policy === undefined) return
        onSubmit({
          policy_id: policy.id,
          target_user_ids: kind === 'user' ? targets : [],
          target_team_ids: kind === 'team' ? targets : [],
        })
      }}
      submitLabel="足す"
      testIdPrefix="staff-policy-add"
      title="権限を足す"
    >
      <fieldset className="flex flex-col gap-1" data-testid="staff-policy-add-options">
        <legend className="mb-1 text-label">権限</legend>
        {policies?.map((p) => (
          <label
            className="flex min-h-11 cursor-pointer items-center gap-2 text-body has-[:disabled]:cursor-default has-[:disabled]:text-text-disabled"
            key={p.id}
          >
            <input
              checked={policyId === p.id}
              data-testid={`staff-policy-add-option-${p.id}`}
              disabled={isSubmitting || owned.has(p.id)}
              name="policy"
              onChange={() => {
                setPolicyId(p.id)
                setTargets([])
              }}
              type="radio"
              value={p.id}
            />
            {p.name}
            {owned.has(p.id) && '（付いています）'}
          </label>
        ))}
      </fieldset>
      {kind !== undefined && (
        <fieldset className="flex flex-col gap-1" data-testid="staff-policy-add-targets">
          <legend className="mb-1 text-label">
            {kind === 'team' ? '対象のチーム' : '対象の職員'}
          </legend>
          {options.map((option) => (
            <label
              className="flex min-h-11 cursor-pointer items-center gap-2 text-body"
              key={option.id}
            >
              <input
                checked={targets.includes(option.id)}
                data-testid={`staff-policy-add-target-${option.id}`}
                disabled={isSubmitting}
                onChange={(event) =>
                  setTargets(
                    event.target.checked
                      ? [...targets, option.id]
                      : targets.filter((id) => id !== option.id),
                  )
                }
                type="checkbox"
              />
              {option.name}
            </label>
          ))}
        </fieldset>
      )}
    </StaffDialogFrame>
  )
}
