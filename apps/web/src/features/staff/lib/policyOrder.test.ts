import { describe, expect, it } from 'vite-plus/test'

import { mockPolicies } from '#/mocks/scheduleData'

import { orderPolicies } from './policyOrder'

describe('orderPolicies', () => {
  it('名前の順に渡しても、予定の 7 つの権限、職員の管理、照合の順に並べる', () => {
    const byName = [...mockPolicies].sort((a, b) => (a.name < b.name ? -1 : 1))

    expect(orderPolicies(byName).map((p) => p.code)).toEqual(mockPolicies.map((p) => p.code))
  })
})
