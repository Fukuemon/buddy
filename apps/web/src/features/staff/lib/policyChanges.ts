import {
  STAFF_MANAGE,
  type Policy,
  type Position,
  type StaffDetail,
  type StaffPolicy,
  type StaffPolicyInput,
} from '#/api/types'

import { policyTargetKind } from './format'

/** 権限ごとの選択。checked は職員に付けるか、targets は対象の職員かチームの ID である。 */
export type PolicySelection = Record<Policy['code'], { checked: boolean; targets: string[] }>

/** 権限の保存で送る 1 つの変更。name は、失敗を示すときの権限の名前である。 */
export type PolicyChange =
  | { kind: 'remove'; name: string; userPolicyId: StaffPolicy['user_policy_id'] }
  | { kind: 'add'; name: string; input: StaffPolicyInput }

/** 権限を、予定の 7 つの後に職員の管理を置く並びにする。 */
export const orderPolicies = (policies: readonly Policy[]) => [
  ...policies.filter((p) => p.code !== STAFF_MANAGE),
  ...policies.filter((p) => p.code === STAFF_MANAGE),
]

/** 付いている権限の、付いた理由。役職に決まっている権限は対象によらず「役職で付く」にする。 */
export const policyOrigin = (policy: Pick<StaffPolicy, 'policy_id'>, position?: Position) =>
  position?.policies.some((p) => p.id === policy.policy_id) ? '役職で付く' : '個別に足した'

const targetsOf = (policy: StaffPolicy) => [...policy.target_user_ids, ...policy.target_team_ids]

/** 職員に付いている権限から、権限を変えるダイアログの最初の選択を作る。 */
export const selectionOf = (staff: StaffDetail, policies: readonly Policy[]): PolicySelection =>
  Object.fromEntries(
    policies.map((policy) => {
      const owned = staff.policies.find((p) => p.policy_id === policy.id)
      return [
        policy.code,
        { checked: owned !== undefined, targets: owned === undefined ? [] : targetsOf(owned) },
      ]
    }),
  )

const sameTargets = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

/**
 * 開いたときの権限と選択を比べ、送る変更を、外す変更、足す変更の順で返す。
 * 対象を変えた権限は、外してから新しい対象で足し直す。対象を指定しない権限の対象は比べない。
 */
export const planPolicyChanges = (
  staff: StaffDetail,
  policies: readonly Policy[],
  selection: PolicySelection,
): PolicyChange[] => {
  const removes: PolicyChange[] = []
  const adds: PolicyChange[] = []
  for (const policy of policies) {
    const owned = staff.policies.find((p) => p.policy_id === policy.id)
    const selected = selection[policy.code] ?? { checked: false, targets: [] }
    const kind = policyTargetKind(policy)
    const retarget =
      owned !== undefined &&
      selected.checked &&
      kind !== undefined &&
      !sameTargets(targetsOf(owned), selected.targets)
    if (owned !== undefined && (!selected.checked || retarget))
      removes.push({ kind: 'remove', name: policy.name, userPolicyId: owned.user_policy_id })
    if (selected.checked && (owned === undefined || retarget))
      adds.push({
        kind: 'add',
        name: policy.name,
        input: {
          policy_id: policy.id,
          target_user_ids: kind === 'user' ? selected.targets : [],
          target_team_ids: kind === 'team' ? selected.targets : [],
        },
      })
  }
  return [...removes, ...adds]
}

/** 選択した権限のうち、対象を指定する権限の全てに、対象が 1 つ以上あるか。 */
export const hasTargetsForAll = (policies: readonly Policy[], selection: PolicySelection) =>
  policies.every(
    (policy) =>
      policyTargetKind(policy) === undefined ||
      !selection[policy.code]?.checked ||
      selection[policy.code].targets.length > 0,
  )
