import { describe, expect, it } from 'vite-plus/test'

import { mockMe, mockPolicies } from '#/mocks/scheduleData'

import { planPolicyChanges, selectionOf } from './policyChanges'

describe('planPolicyChanges', () => {
  it('職員の管理の権限を外す変更は、ほかの権限を外す変更と足す変更の後に送る', () => {
    const staff = {
      ...mockMe,
      policies: [
        ...mockMe.policies,
        {
          user_policy_id: 'user-policy-2',
          policy_id: 'policy-user-read',
          code: 'schedule.user.read',
          name: '指定した職員の予定の閲覧',
          target_user_ids: ['staff-1'],
          target_team_ids: [],
        },
      ],
    }
    const selection = selectionOf(staff, mockPolicies)
    selection['staff.manage'] = { checked: false, targets: [] }
    selection['schedule.user.read'] = { checked: true, targets: ['staff-2'] }
    selection['schedule.all.read'] = { checked: true, targets: [] }

    const changes = planPolicyChanges(staff, mockPolicies, selection)

    expect(changes.map((c) => `${c.kind} ${c.name}`)).toEqual([
      'remove 指定した職員の予定の閲覧',
      'add 指定した職員の予定の閲覧',
      'add 事業所の全ての予定の閲覧',
      'remove 職員の管理',
    ])
  })
})
