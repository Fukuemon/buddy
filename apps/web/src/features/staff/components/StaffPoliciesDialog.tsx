import { InputDialog } from '@buddy/ui'
import { useState } from 'react'

import type { Policy, Position, StaffDetail } from '#/api/types'
import { ChipPicker } from '#/components/site/ChipPicker'

import { policyTargetKind } from '../lib/format'
import {
  hasTargetsForAll,
  groupPolicies,
  planPolicyChanges,
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
 * 役職で付く権限とほかの権限のまとまりに分けて並べる。対象を指定する権限にチェックを入れると、その下に選んだ対象のチップと、
 * 名前で探して足す欄を出す。開いたときから変え、対象を指定する権限の全てに対象を選ぶと保存できる。
 * 職員を読み直すと、選択を読み直した権限に合わせる。
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
  const groups = groupPolicies(policies, position)
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
      <div className="flex flex-col gap-4" data-testid="staff-policies-options">
        {[
          {
            id: 'position',
            title: `役職「${staff.position.name}」で付く権限`,
            items: groups.position,
          },
          { id: 'other', title: 'ほかの権限', items: groups.other },
        ]
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <fieldset
              className="flex flex-col"
              data-testid={`staff-policies-group-${group.id}`}
              key={group.id}
            >
              <legend className="mb-1 text-label text-text-secondary">{group.title}</legend>
              <ul className="flex flex-col divide-y divide-border">
                {group.items.map((policy) => {
                  const selected = selection[policy.code] ?? { checked: false, targets: [] }
                  const kind = policyTargetKind(policy)
                  return (
                    <li className="flex flex-col gap-2 py-1" key={policy.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body">
                        <input
                          checked={selected.checked}
                          data-testid={`staff-policies-option-${policy.code}`}
                          disabled={isSubmitting}
                          onChange={(event) =>
                            update(policy.code, { checked: event.target.checked })
                          }
                          type="checkbox"
                        />
                        {policy.name}
                      </label>
                      {kind !== undefined && selected.checked && (
                        <div className="pb-2 pl-6" data-testid="staff-policies-targets">
                          <ChipPicker
                            addAriaLabel={
                              kind === 'team' ? '対象のチームを選ぶ' : '対象の職員を選ぶ'
                            }
                            addLabel={kind === 'team' ? '＋ チームを選ぶ' : '＋ 職員を選ぶ'}
                            disabled={isSubmitting}
                            emptyLabel={
                              kind === 'team' ? '選べるチームはいません' : '選べる職員はいません'
                            }
                            label={kind === 'team' ? '対象のチーム' : '対象の職員'}
                            onChange={(targets) => update(policy.code, { targets })}
                            options={kind === 'team' ? teamOptions : staffOptions}
                            selected={selected.targets}
                            testIdPrefix="staff-policies-target"
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          ))}
      </div>
    </InputDialog>
  )
}
