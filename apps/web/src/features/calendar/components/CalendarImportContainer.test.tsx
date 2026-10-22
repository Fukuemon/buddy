import { composeStories } from '@storybook/react-vite'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './CalendarImportContainer.stories'

const { Initial, WithStaff, Forbidden, NoCalendar, PreviewError, SubmitError } =
  composeStories(stories)

const submit = () => screen.getByTestId('calendar-import-submit')

const preview = async () => {
  await userEvent.click(await screen.findByTestId('calendar-import-preview'))
  return screen.findByTestId('calendar-import-result-preview')
}

const resolveAll = async () => {
  await userEvent.click(screen.getByTestId('calendar-import-review-patient-event-ambiguous'))
  await userEvent.selectOptions(
    screen.getByTestId('calendar-import-review-patient-select-event-ambiguous'),
    'patient-1',
  )
  await userEvent.click(screen.getByTestId('calendar-import-review-normal-event-missing'))
}

describe('CalendarImportContainer', () => {
  it('結び付けた職員だけを選択肢にし、search params の職員を選ぶ', async () => {
    render(<WithStaff />)
    const staff = await screen.findByTestId('calendar-import-staff')
    expect(
      within(staff)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toHaveLength(2)
    expect(staff).toHaveValue('staff-2')
  })

  it('プレビューの結果は、取り込み方を全て選ぶまで確定して取り込むを押せない', async () => {
    render(<Initial />)
    const result = await preview()
    expect(within(result).getByTestId('calendar-import-count-import')).toHaveTextContent('18 件')
    expect(screen.getByTestId('calendar-import-remaining')).toHaveTextContent(
      '確かめが要る予定のうち、あと 2 件の取り込み方を選んでください。',
    )
    expect(submit()).toHaveAttribute('aria-disabled', 'true')

    await userEvent.click(screen.getByTestId('calendar-import-review-patient-event-ambiguous'))
    // 利用者を選ぶまでは、選び終えていない
    expect(screen.getByTestId('calendar-import-remaining')).toHaveTextContent('あと 2 件')
    const patient = screen.getByTestId('calendar-import-review-patient-select-event-ambiguous')
    expect(within(patient).getAllByRole('option')[1]).toHaveTextContent(
      '加藤 春子（担当 青木 一郎）',
    )
    await userEvent.selectOptions(patient, 'patient-1')
    expect(screen.getByTestId('calendar-import-remaining')).toHaveTextContent('あと 1 件')

    await userEvent.click(screen.getByTestId('calendar-import-review-skip-event-missing'))
    expect(screen.queryByTestId('calendar-import-remaining')).toBeNull()
    expect(submit()).not.toHaveAttribute('aria-disabled')
  })

  it('確定すると、取り込みの結果に替える', async () => {
    render(<Initial />)
    await preview()
    await resolveAll()
    await userEvent.click(submit())

    const result = await screen.findByTestId('calendar-import-result')
    expect(result).toHaveTextContent('取り込みました')
    expect(within(result).getByTestId('calendar-import-result-counts')).toHaveTextContent(
      '確かめた 2 件のうち 1 件は利用者を選び、1 件は通常の予定にした',
    )
    expect(screen.queryByTestId('calendar-import-result-preview')).toBeNull()
  })

  it('同じ期間をもう一度プレビューすると、全て取り込み済みにし、確定を押せない', async () => {
    render(<Initial />)
    await preview()
    await resolveAll()
    await userEvent.click(submit())
    await screen.findByTestId('calendar-import-result')
    await userEvent.click(screen.getByTestId('calendar-import-preview'))

    expect(await screen.findByTestId('calendar-import-all-imported')).toBeInTheDocument()
    expect(submit()).toHaveAttribute('aria-disabled', 'true')
  })

  it('期間を変えるとプレビューの結果を消し、開始日が終了日より後ならプレビューを押せない', async () => {
    render(<Initial />)
    await preview()
    fireEvent.change(screen.getByTestId('calendar-import-start'), {
      target: { value: '2099-01-01' },
    })

    expect(screen.queryByTestId('calendar-import-result-preview')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '開始日は、終了日より前の日にしてください。',
    )
    expect(screen.getByTestId('calendar-import-preview')).toHaveAttribute('aria-disabled', 'true')
  })

  it('プレビューが失敗したら、理由ごとの文を出す', async () => {
    render(<PreviewError />)
    await userEvent.click(await screen.findByTestId('calendar-import-preview'))
    expect(await screen.findByTestId('calendar-import-error')).toHaveTextContent(
      'Google カレンダーから予定を読めませんでした。時間をおいて、もう一度プレビューしてください。',
    )
  })

  it('取り込みが失敗したら、プレビューの結果と選んだ取り込み方を残して理由を出す', async () => {
    render(<SubmitError />)
    await preview()
    await resolveAll()
    await userEvent.click(submit())

    expect(await screen.findByTestId('calendar-import-error')).toHaveTextContent(
      'プレビューの後に、Google カレンダーの予定が変わりました。',
    )
    expect(screen.getByTestId('calendar-import-review-normal-event-missing')).toBeChecked()
  })

  it('結び付けたカレンダーが無ければ、職員と期間の欄を出さない', async () => {
    render(<NoCalendar />)
    expect(await screen.findByTestId('calendar-import-no-calendar')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-import-form')).toBeNull()
  })

  it('職員の管理の権限が無ければ、権限が無いことを示す', async () => {
    render(<Forbidden />)
    expect(await screen.findByTestId('page-forbidden')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-import-load-error')).toBeNull()
  })
})
