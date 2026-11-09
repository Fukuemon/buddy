import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ScheduleDetailModal.stories'

const { Visit, Normal, Cancelled, Recurring } = composeStories(stories)

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

  it('予定をキャンセルするボタンは、赤い文字の destructive にして下端の先頭に置き、「閉じる」と編集をその後に並べる', async () => {
    const onCancelSchedule = fn()
    render(<Normal onCancelSchedule={onCancelSchedule} />)
    const cancel = screen.getByTestId('schedule-detail-cancel-schedule')
    const close = screen.getByTestId('schedule-detail-close')
    expect(cancel).toHaveClass('text-danger')
    expect(cancel).toHaveClass('mr-auto')
    expect(cancel.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(cancel)
    expect(onCancelSchedule).toHaveBeenCalledOnce()
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

  it('繰り返しの予定のまだ変えていない回は、「繰り返し」の行に規則を出す', () => {
    render(<Recurring />)
    expect(screen.getByTestId('schedule-detail-recurrence')).toHaveTextContent(
      '繰り返し隔週 月曜日、木曜日',
    )
  })

  it('終了日のある毎月の規則は、終了日を後ろに付けて出す', () => {
    const schedule = Recurring.args.schedule!
    render(
      <Recurring
        schedule={{
          ...schedule,
          recurrence: {
            recurringScheduleId: 'recurring-1',
            rule: {
              frequency: 'monthly',
              daysOfWeek: null,
              interval: null,
              dayOfWeek: 1,
              dayOfMonth: null,
              weekOfMonth: 2,
              endDate: '2027-03-31',
            },
          },
        }}
      />,
    )
    expect(screen.getByTestId('schedule-detail-recurrence')).toHaveTextContent(
      '毎月 第 2 月曜日（2027年3月31日（水）まで）',
    )
  })

  it('単発の予定と、1 回を置き換えた予定（recurrence を持たない予定）は、「繰り返し」の行を出さない', () => {
    render(<Visit />)
    expect(screen.queryByTestId('schedule-detail-recurrence')).not.toBeInTheDocument()
    expect(screen.queryByText('繰り返し')).not.toBeInTheDocument()
  })
})
