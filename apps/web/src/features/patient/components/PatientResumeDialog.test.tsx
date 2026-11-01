import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import type { StaffRecord } from '#/api/types'
import { mockPatients, mockStaff } from '#/mocks/scheduleData'

import { PatientResumeDialog } from './PatientResumeDialog'

const patient = {
  ...mockPatients[4],
  assigned_staff_id: 'staff-2',
  assigned_staff_name: '石川 二葉',
}
const onLeave: StaffRecord = { ...mockStaff[1], status: 'on_leave' }
const active = [mockStaff[0], mockStaff[2]]

const dialog = (props: Partial<Parameters<typeof PatientResumeDialog>[0]>) => (
  <PatientResumeDialog
    isSubmitting={false}
    onCancel={() => {}}
    onSubmit={() => {}}
    patient={patient}
    {...props}
  />
)

describe('PatientResumeDialog', () => {
  it('職員を読み終える前に開き、読み終えた今の担当が休職なら、何も選ばずに理由を出し、再開を押せない', () => {
    const { rerender } = render(dialog({}))
    expect(screen.getByTestId('patient-resume-staff')).toHaveValue('')

    rerender(dialog({ staffOptions: active, currentStaff: onLeave }))
    expect(screen.getByTestId('patient-resume-staff')).toHaveValue('')
    expect(screen.getByTestId('patient-resume-staff-note')).toHaveTextContent(
      '今の担当の 石川 二葉 は休職しています。担当の職員を選んでください。',
    )
    expect(screen.getByTestId('patient-resume-submit')).toHaveAttribute('aria-disabled', 'true')
  })

  it('今の担当が選択肢にあれば、その職員を選んで始める', () => {
    render(
      dialog({
        staffOptions: [...active, mockStaff[1]],
        currentStaff: mockStaff[1],
      }),
    )
    expect(screen.getByTestId('patient-resume-staff')).toHaveValue('staff-2')
    expect(screen.queryByTestId('patient-resume-staff-note')).toBeNull()
  })
})
