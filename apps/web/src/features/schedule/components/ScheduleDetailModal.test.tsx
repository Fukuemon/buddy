import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleDetailModal.stories'

const { Visit, Normal, Cancelled } = composeStories(stories)

describe('ScheduleDetailModal', () => {
  it('訪問の予定は利用者とサービスコードを出す', () => {
    render(<Visit />)
    expect(screen.getByText('加藤 春子')).toBeInTheDocument()
    expect(screen.getByText('訪看I2')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: '2026年10月20日（火） 09:00〜09:29' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '訪問の情報' })).toHaveTextContent('加藤 春子')
  })

  it('通常の予定はタイトルを出し、編集を押すと onEdit を呼ぶ', async () => {
    const onEdit = fn()
    render(<Normal onEdit={onEdit} />)
    expect(screen.getByText('カンファレンス')).toBeInTheDocument()
    expect(screen.queryByText('利用者')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-visit')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'メモ' })).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('schedule-detail-edit'))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('下端の閉じるは、編集の左に置き、押すと onClose を呼ぶ。右上に × を出さない', async () => {
    const onClose = fn()
    render(<Normal onClose={onClose} />)
    const close = screen.getByTestId('schedule-detail-close')
    const edit = screen.getByTestId('schedule-detail-edit')
    expect(close.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId('modal-close')).not.toBeInTheDocument()
    await userEvent.click(close)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('メモが空の予定は、メモの見出しごと出さない', () => {
    render(<Normal schedule={{ ...Normal.args.schedule!, description: '' }} />)
    expect(screen.queryByRole('region', { name: 'メモ' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-memo')).not.toBeInTheDocument()
    expect(screen.queryByText('なし')).not.toBeInTheDocument()
  })

  it('キャンセルした予定は理由を出し、下端の閉じると編集のボタンを出さず、右上の × で閉じる', async () => {
    const onClose = fn()
    render(<Cancelled onClose={onClose} />)
    expect(screen.getByTestId('schedule-detail-cancel')).toHaveTextContent(
      'キャンセルした予定です。理由: 利用者の体調不良',
    )
    expect(screen.queryByTestId('schedule-detail-close')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schedule-detail-edit')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('modal-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
