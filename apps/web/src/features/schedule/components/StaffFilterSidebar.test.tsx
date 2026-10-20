import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './StaffFilterSidebar.stories'

const { AllStaff, PartiallySelected } = composeStories(stories)

describe('StaffFilterSidebar', () => {
  it('全員の表示から 1 人を外すと、残りの職員を選ぶ', async () => {
    const onChange = fn()
    render(<AllStaff onChange={onChange} />)
    await userEvent.click(screen.getByTestId('staff-filter-staff-staff-2'))
    expect(onChange).toHaveBeenCalledWith(['staff-1', 'staff-3', 'staff-4'])
  })

  it('チームを選ぶとメンバーを全員足し、全員になったら空の配列にする', async () => {
    const onChange = fn()
    render(<PartiallySelected onChange={onChange} />)
    expect(screen.getByTestId('staff-filter-team-team-a')).toHaveProperty('indeterminate', true)

    await userEvent.click(screen.getByTestId('staff-filter-team-team-a'))
    expect(onChange).toHaveBeenCalledWith(['staff-1', 'staff-3', 'staff-2'])
  })

  it('最後の 1 人は外せない', async () => {
    const onChange = fn()
    render(<PartiallySelected onChange={onChange} selectedStaffIds={['staff-1']} />)
    await userEvent.click(screen.getByTestId('staff-filter-staff-staff-1'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
