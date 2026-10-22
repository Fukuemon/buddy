import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ReceiptCheckForm.stories'

const { Calendar, ScheduleCsv, Ready, RowErrors } = composeStories(stories)

describe('ReceiptCheckForm', () => {
  it('Google カレンダーでは対象の月を、予定の CSV ではファイルの欄を出す', () => {
    const { unmount } = render(<Calendar />)
    expect(screen.getByTestId('receipt-month')).toHaveProperty('value', '2024-04')
    expect(screen.queryByTestId('receipt-schedules-file')).toBeNull()
    unmount()
    render(<ScheduleCsv />)
    expect(screen.getByTestId('receipt-schedules-file')).toBeDefined()
    expect(screen.queryByTestId('receipt-month')).toBeNull()
  })

  it('入力がそろうまでは送らない', async () => {
    const onSubmit = fn()
    render(<Calendar onSubmit={onSubmit} />)
    await userEvent.click(screen.getByTestId('receipt-check-submit'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('入力がそろえば送る', async () => {
    const onSubmit = fn()
    render(<Ready onSubmit={onSubmit} />)
    await userEvent.click(screen.getByTestId('receipt-check-submit'))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('選んだ実績のファイルを渡す', async () => {
    const onVisitsChange = fn()
    render(<Calendar onVisitsChange={onVisitsChange} />)
    const file = new File(['訪問日'], 'visits.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByTestId('receipt-visits-file'), file)
    expect(onVisitsChange).toHaveBeenCalledWith(file)
  })

  it('入力の CSV のエラーを、ファイルと行と列で並べる', () => {
    render(<RowErrors />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(
      '実績の CSV の 3 行目の「訪問日」: 暦にない日付: 2024-13-01',
    )
    expect(alert.textContent).toContain('予定の CSV の 5 行目: 列の数が見出しと違う')
  })
})
