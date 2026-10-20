import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleDetailModal.stories'

const { Visit, Normal } = composeStories(stories)

describe('ScheduleDetailModal', () => {
  it('訪問の予定は利用者とサービスコードを出す', () => {
    render(<Visit />)
    expect(screen.getByText('加藤 春子')).toBeInTheDocument()
    expect(screen.getByText('訪看I2')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-detail-datetime')).toHaveTextContent(
      '2026-10-20 09:00 - 09:29',
    )
  })

  it('通常の予定はタイトルを出し、編集を押すと onEdit を呼ぶ', async () => {
    const onEdit = fn()
    render(<Normal onEdit={onEdit} />)
    expect(screen.getByText('カンファレンス')).toBeInTheDocument()
    expect(screen.queryByText('利用者')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('schedule-detail-edit'))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
