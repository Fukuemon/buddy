import { describe, expect, it } from 'vite-plus/test'

import { activePatients } from './activePatients'

describe('activePatients', () => {
  it('利用の終了の利用者を除き、並びを保つ', () => {
    expect(
      activePatients([
        { id: 'patient-2', name: '利用者 B', serviceCode: '訪看I2' },
        { id: 'patient-1', name: '利用者 A', serviceCode: '訪看I2', ended: true },
        { id: 'patient-3', name: '利用者 C', serviceCode: '訪看I3' },
      ]),
    ).toEqual([
      { id: 'patient-2', name: '利用者 B', serviceCode: '訪看I2' },
      { id: 'patient-3', name: '利用者 C', serviceCode: '訪看I3' },
    ])
  })
})
