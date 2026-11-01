import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import { ScheduleFieldSummaryList } from './ScheduleFieldSummaryList'

const renderList = () =>
  render(
    <ScheduleFieldSummaryList
      activeId="staff"
      items={[
        { id: 'staff', label: '主訪問者', placeholder: '選んでください' },
        { id: 'description', label: 'メモ' },
        { id: 'patient', label: '利用者', content: '見本 一郎', placeholder: '選んでください' },
      ]}
      onSelect={() => {}}
    />,
  )

describe('ScheduleFieldSummaryList', () => {
  it('値の無い選ぶ項目は、薄い色の「選んでください」を出し、読み上げでは名前と「未入力」を読ませる', () => {
    renderList()
    const staff = screen.getByTestId('schedule-field-staff')
    expect(staff).toHaveAccessibleName(/^主訪問者\s*未入力$/)
    expect(screen.getByText('選んでください', { selector: '[aria-hidden]' })).toBeVisible()
    expect(staff).not.toHaveTextContent('未選択')
  })

  it('値の無い入力の項目は、何も出さず、読み上げでは名前と「未入力」を読ませる', () => {
    renderList()
    const description = screen.getByTestId('schedule-field-description')
    expect(description).toHaveAccessibleName(/^メモ\s*未入力$/)
    expect(description).not.toHaveTextContent('なし')
  })

  it('値のある項目は、値を出す', () => {
    renderList()
    expect(screen.getByTestId('schedule-field-patient')).toHaveAccessibleName(
      /^利用者\s*見本 一郎$/,
    )
  })
})
