import { describe, expect, it } from 'vite-plus/test'

import { validatePatientForm } from './validate'

describe('validatePatientForm', () => {
  it('空の名前と選んでいない欄ごとに誤りの文を返す', () => {
    expect(
      validatePatientForm({
        name: ' ',
        serviceCodeId: '',
        preferredTime: '',
        preferredGender: '',
        assignedStaffId: '',
      }),
    ).toEqual({
      errors: {
        name: '名前を入れてください',
        serviceCodeId: 'サービスを選んでください',
        preferredTime: '希望の時間帯を選んでください',
        preferredGender: '希望する担当の性別を選んでください',
        assignedStaffId: '担当の職員を選んでください',
      },
    })
  })

  it('誤りが無ければ、名前の前後の空白を除いた送る値を返す', () => {
    expect(
      validatePatientForm({
        name: ' 佐野 春香 ',
        serviceCodeId: 'code-i2',
        preferredTime: '午前',
        preferredGender: '女性',
        assignedStaffId: 'staff-1',
      }),
    ).toEqual({
      input: {
        name: '佐野 春香',
        service_code_id: 'code-i2',
        preferred_time: '午前',
        preferred_gender: '女性',
        assigned_staff_id: 'staff-1',
      },
    })
  })
})
