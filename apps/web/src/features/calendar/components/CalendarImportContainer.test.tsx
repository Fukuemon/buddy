import { composeStories, composeStory } from '@storybook/react-vite'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import { refocusWindow } from '#/test/refocusWindow'

import * as stories from './CalendarImportContainer.stories'

const { Cutover, Initial, WithStaff, NoCalendar, PreviewError, SubmitError } =
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

  it('利用者を選ぶ選択肢に、利用の終了の利用者を出さない', async () => {
    render(<Initial />)
    await preview()
    await userEvent.click(screen.getByTestId('calendar-import-review-patient-event-ambiguous'))
    const values = within(
      screen.getByTestId('calendar-import-review-patient-select-event-ambiguous'),
    )
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
    expect(values).toContain('patient-1')
    expect(values).not.toContain('patient-ended')
  })

  it('プレビューの結果は、取り込み方を全て選ぶまで確定して取り込むを押せない', async () => {
    render(<Initial />)
    const result = await preview()
    expect(within(result).getByTestId('calendar-import-count-import')).toHaveTextContent('18 件')
    expect(screen.getByTestId('calendar-import-remaining')).toHaveTextContent(
      '確認が必要な予定のうち、あと 2 件の取り込み方を選んでください。',
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
    expect(within(result).getByTestId('calendar-import-result-count-imported')).toBeInTheDocument()
    expect(within(result).getByTestId('calendar-import-result-counts')).not.toHaveTextContent(
      '確認した',
    )
    expect(within(result).queryByTestId('calendar-import-result-count-already_imported')).toBeNull()
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
    expect(screen.getByTestId('calendar-import-start')).toHaveAccessibleDescription(
      /開始日は、終了日より前の日にしてください。/,
    )
    expect(screen.getByTestId('calendar-import-preview')).toHaveAttribute('aria-disabled', 'true')
    // 期間の誤りは欄の下に出るので、ボタンの横の条件の文は出さない
    expect(screen.queryByTestId('calendar-import-preview-hint')).toBeNull()
  })

  it('開始日を空にすると、プレビューを押せず、ボタンの横に押せるようにする条件を出す', async () => {
    render(<Initial />)
    fireEvent.change(await screen.findByTestId('calendar-import-start'), {
      target: { value: '' },
    })

    expect(screen.getByTestId('calendar-import-preview')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('calendar-import-preview')).toHaveAccessibleDescription(
      '開始日と終了日を入れると、プレビューできます。',
    )
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
      'プレビューの後に、Google カレンダーの予定か職員の休職が変わりました。',
    )
    expect(screen.getByTestId('calendar-import-review-normal-event-missing')).toBeChecked()
  })

  it('結び付けたカレンダーが無ければ、職員と期間の欄を出さない', async () => {
    render(<NoCalendar />)
    expect(await screen.findByTestId('calendar-import-no-calendar')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-import-form')).toBeNull()
  })

  it('予定の管理の移行の間は、移行の期間で取り込み、規則を写せない繰り返しは取り込まないだけを選べる', async () => {
    render(<Cutover />)
    expect(await screen.findByTestId('calendar-import-cutover-range')).toHaveTextContent(
      '2026年11月1日（日）〜',
    )
    expect(screen.queryByTestId('calendar-import-start')).toBeNull()
    const result = await preview()
    expect(within(result).getByTestId('calendar-import-count-overwrite')).toHaveTextContent('1 件')
    const unsupported = screen.getByTestId('calendar-import-review-event-biweekly')
    expect(unsupported).toHaveTextContent('繰り返しの規則を buddy に写せない')
    expect(
      within(unsupported).queryByTestId('calendar-import-review-patient-event-biweekly'),
    ).toBeNull()
    await resolveAll()
    await userEvent.click(screen.getByTestId('calendar-import-review-skip-event-biweekly'))
    await userEvent.click(submit())
    expect(await screen.findByTestId('calendar-import-back-to-cutover')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-import-open-calendar')).toBeNull()
  })
})

describe('予定の取り込みの読み直し', () => {
  it('読み終えた後に読み直して結び付いたカレンダーを読めなければ、表示を残して失敗の文を出し、読み直すで読めたら消す', async () => {
    const Story = composeStory(
      {
        ...stories.RefetchError,
        parameters: {
          ...stories.default.parameters,
          appRouter: { ...stories.default.parameters.appRouter, api: stories.refetchFailingApi() },
        },
      },
      stories.default,
    )
    render(<Story />)
    await screen.findByTestId('calendar-import-form')

    refocusWindow()
    expect(await screen.findByTestId('refetch-error')).toHaveTextContent(
      '最新の情報を読み込めませんでした。',
    )
    expect(screen.getByTestId('calendar-import-form')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('refetch-retry'))
    await expect.poll(() => screen.queryByTestId('refetch-error')).toBeNull()
  })
})
