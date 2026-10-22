import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleEditModalContainer.stories'

const { Cancelled } = composeStories(stories)

describe('ScheduleEditModalContainer', () => {
  it('キャンセルした予定の編集の URL では、フォームを出さずに案内の文を出す', async () => {
    render(<Cancelled />)
    expect(await screen.findByText('キャンセルした予定は編集できません。')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-edit-submit')).not.toBeInTheDocument()
  })
})
