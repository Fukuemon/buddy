import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleDetailModalContainer.stories'

const { Cancelled } = composeStories(stories)

describe('ScheduleDetailModalContainer', () => {
  it('キャンセルした予定を取って、理由を出し、編集のボタンを出さない', async () => {
    render(<Cancelled />)
    expect(await screen.findByTestId('schedule-detail-cancel')).toHaveTextContent(
      'キャンセルした予定です。理由: 利用者の体調不良',
    )
    expect(screen.queryByTestId('schedule-detail-edit')).not.toBeInTheDocument()
  })
})
