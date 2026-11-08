import { composeStories } from '@storybook/react-vite'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import type { Schedule } from '#/api/types'
import type { AppRouterParameters } from '#/storybook/withAppRouter'

import * as stories from './ScheduleEditModalContainer.stories'

const {
  Cancelled,
  Forbidden,
  GooglePrimary,
  GooglePrimaryChangedInGoogle,
  GooglePrimaryFromOtherDay,
  GooglePrimaryNeedsReview,
  GooglePrimaryRecurrenceUnsupported,
  NotFound,
  SuspendedStaff,
  RecurringFollowingPast,
  RecurringOccurrence,
  Visit,
  VisitWithOtherServiceCode,
} = composeStories(stories)

describe('ScheduleEditModalContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('編集の権限の外の予定の編集の URL では、フォームを出さずに権限が無いことを出す', async () => {
    render(<Forbidden />)
    expect(await screen.findByTestId('schedule-edit-forbidden')).toHaveTextContent(
      'この予定を編集する権限がありません。',
    )
    expect(screen.queryByTestId('schedule-edit-submit')).not.toBeInTheDocument()
  })

  it('繰り返しの予定の回でない予定では、変更の範囲を出さない', async () => {
    render(<Visit />)
    expect(await screen.findByTestId('schedule-field-date-time')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-edit-scope')).not.toBeInTheDocument()
  })

  it('繰り返しの予定の回では、変更の範囲を「この回だけ」にして、回のフォームを出す', async () => {
    render(<RecurringOccurrence />)
    expect(await screen.findByTestId('schedule-edit-scope-occurrence')).toBeChecked()
    expect(screen.getByTestId('schedule-field-date-time')).toBeInTheDocument()
  })

  it('「この日以降の全ての回」を選ぶと、項目の一覧の代わりに、今の繰り返しを初期値にした繰り返しの欄を出す', async () => {
    render(<RecurringOccurrence />)
    await userEvent.click(await screen.findByTestId('schedule-edit-scope-following'))

    expect(screen.queryByTestId('schedule-field-date-time')).not.toBeInTheDocument()
    expect(screen.getByTestId('schedule-edit-rule-lead')).toHaveTextContent(
      '以降の回の繰り返しだけを変え',
    )
    expect(screen.getByTestId('recurring-rule-frequency-weekly')).toBeChecked()
    expect(screen.getByTestId('recurring-rule-has-end-date')).not.toBeChecked()
  })

  it('繰り返しを変えずに保存すると、変えることを促し、規則の変更を送らない', async () => {
    const { api } = RecurringOccurrence.parameters.appRouter as AppRouterParameters
    if (api === undefined) throw new Error('story にフェイクの API が無い')
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<RecurringOccurrence />)
    await userEvent.click(await screen.findByTestId('schedule-edit-scope-following'))
    await userEvent.click(screen.getByTestId('schedule-edit-submit'))

    expect(await screen.findByText('今の繰り返しから変えてください')).toBeInTheDocument()
    expect(changeRule).not.toHaveBeenCalled()
  })

  it('終了日だけを変えると、今の規則の終了日だけを替えて送る', async () => {
    const { api } = RecurringOccurrence.parameters.appRouter as AppRouterParameters
    if (api === undefined) throw new Error('story にフェイクの API が無い')
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<RecurringOccurrence />)
    await userEvent.click(await screen.findByTestId('schedule-edit-scope-following'))
    await userEvent.click(screen.getByTestId('recurring-rule-has-end-date'))
    await userEvent.clear(screen.getByTestId('recurring-rule-end-date'))
    await userEvent.type(screen.getByTestId('recurring-rule-end-date'), '2099-12-31')
    await userEvent.click(screen.getByTestId('schedule-edit-submit'))

    await waitFor(() => expect(changeRule).toHaveBeenCalledOnce())
    expect(changeRule.mock.calls[0]?.[2].rule).toEqual({
      frequency: 'weekly',
      dayOfWeek: null,
      dayOfMonth: null,
      weekOfMonth: null,
      endDate: '2099-12-31',
    })
  })

  it('今日より前の回で「この日以降の全ての回」を選ぶと、変えられないことを出し、保存を押せない', async () => {
    render(<RecurringFollowingPast />)
    await userEvent.click(await screen.findByTestId('schedule-edit-scope-following'))

    expect(screen.getByTestId('schedule-edit-rule-past')).toHaveTextContent(
      '今日より前の回からは、繰り返しを変えられません。',
    )
    expect(screen.getByTestId('schedule-edit-submit')).toHaveAttribute('aria-disabled', 'true')
  })

  it('曜日を変えて保存すると、開いた回の日を適用の日にして規則の変更を送り、予定のカレンダーへ戻る', async () => {
    const { api, history } = RecurringOccurrence.parameters.appRouter as AppRouterParameters
    if (api === undefined || history === undefined)
      throw new Error('story にフェイクの API と履歴が無い')
    // 履歴は story の間で共有し、前のテストの保存でカレンダーへ移っていることがあるので、編集の URL に戻す
    history.push('/schedule/recurring-occurrence/edit')
    const changeRule = vi.spyOn(api.schedules, 'changeRule')
    render(<RecurringOccurrence />)
    await userEvent.click(await screen.findByTestId('schedule-edit-scope-following'))
    const opened = screen.getByTestId('schedule-edit-rule-lead').textContent?.slice(0, 10)
    await userEvent.click(screen.getByTestId('recurring-rule-day-of-week-3'))
    await userEvent.click(screen.getByTestId('schedule-edit-submit'))

    await waitFor(() => expect(history.location.pathname).toBe('/schedule'))
    const [, recurringId, change, etag] = changeRule.mock.calls[0] ?? []
    expect(recurringId).toBe('recurring-1')
    expect(change).toMatchObject({
      effectiveDate: opened,
      rule: {
        frequency: 'weekly',
        dayOfWeek: 3,
        dayOfMonth: null,
        weekOfMonth: null,
        endDate: null,
      },
    })
    expect(change?.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(etag).toBeNull()
    expect(new URLSearchParams(history.location.search).get('date')).toBe(opened)
  })

  it('開いたときは、利用者のサービスコードによらず、予定のサービスコードと提供時間のままにする', async () => {
    render(<VisitWithOtherServiceCode />)

    expect(await screen.findByTestId('service-code-訪看I4')).toBeChecked()
    expect(screen.getByTestId('schedule-form-service-time')).toHaveValue(89)
  })

  it('利用者を替えると、替えた後の利用者のサービスコードを選び、提供時間をそのコードの上限にする', async () => {
    render(<VisitWithOtherServiceCode />)

    await userEvent.click(await screen.findByTestId('schedule-field-patient'))
    await userEvent.click(screen.getByTestId('patient-select-option-patient-2'))
    await userEvent.click(screen.getByTestId('schedule-field-date-time'))

    expect(screen.getByTestId('service-code-訪看I3')).toBeChecked()
    expect(screen.getByTestId('schedule-form-service-time')).toHaveValue(59)
  })

  it('サービスコードを手で選んだ後に利用者を替えても、サービスコードと提供時間を変えない', async () => {
    render(<VisitWithOtherServiceCode />)

    await userEvent.click(await screen.findByTestId('service-code-医'))
    await userEvent.click(screen.getByTestId('schedule-field-patient'))
    await userEvent.click(screen.getByTestId('patient-select-option-patient-2'))
    await userEvent.click(screen.getByTestId('schedule-field-date-time'))

    expect(screen.getByTestId('service-code-医')).toBeChecked()
    expect(screen.getByTestId('schedule-form-service-time')).toHaveValue(90)
  })

  it('予定が見つからないときは、予定が見つからないことを出す', async () => {
    render(<NotFound />)
    expect(await screen.findByRole('alert')).toHaveTextContent('予定が見つかりません。')
  })

  it('キャンセルした予定の編集の URL では、フォームを出さずに案内の文を出す', async () => {
    render(<Cancelled />)
    expect(await screen.findByText('キャンセルした予定は編集できません。')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-edit-submit')).not.toBeInTheDocument()
  })

  it('止めた職員に割り振った予定では、主訪問者の名前を出したまま、候補に止めた職員を出さない', async () => {
    render(<SuspendedStaff />)

    const staffField = await screen.findByTestId('schedule-field-staff')
    expect(within(staffField).getByText('石川 二葉')).toBeInTheDocument()
    await userEvent.click(staffField)
    expect(screen.getByTestId('staff-select-option-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-select-option-staff-2')).not.toBeInTheDocument()
  })

  it('止めた職員に割り振った予定を主訪問者を選ばずに保存すると、主訪問者を変えずに送る', async () => {
    const { api } = SuspendedStaff.parameters.appRouter as AppRouterParameters
    if (api === undefined) throw new Error('story にフェイクの API が無い')
    // story の間で共有するフェイクの API の予定を書き換えるので、このテストをファイルの最後に置く
    const update = vi.spyOn(api.schedules, 'update')
    render(<SuspendedStaff />)

    await userEvent.click(await screen.findByTestId('schedule-edit-submit'))

    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0]?.[2]).toMatchObject({ staffId: 'staff-2' })
  })

  it('google_primary の事業所では、フォームを出し、編集を開いたときの etag で保存する', async () => {
    const { api } = GooglePrimary.parameters.appRouter as AppRouterParameters
    if (api === undefined) throw new Error('story にフェイクの API が無い')
    const update = vi.spyOn(api.schedules, 'update')
    render(<GooglePrimary />)

    await userEvent.click(await screen.findByTestId('schedule-edit-submit'))

    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0]?.[3]).toBe('"etag-schedule-1"')
  })

  it('カレンダーで別の日を開いていても、Google カレンダーの予定を保存したら、予定の日のカレンダーで詳細を開く', async () => {
    const { api, history } = GooglePrimaryFromOtherDay.parameters.appRouter as AppRouterParameters
    if (api === undefined || history === undefined)
      throw new Error('story にフェイクの API と履歴が無い')
    const update = vi.spyOn(api.schedules, 'update')
    render(<GooglePrimaryFromOtherDay />)

    await userEvent.click(await screen.findByTestId('schedule-edit-submit'))

    await waitFor(() => expect(history.location.pathname).toBe('/schedule/gcal-schedule-1'))
    const savedDate = update.mock.calls[0]?.[2].startsAt.slice(0, 10)
    expect(savedDate).toBeDefined()
    expect(new URLSearchParams(history.location.search).get('date')).toBe(savedDate)
  })

  it('編集を開いた後に Google カレンダーで予定が変わっていたら、入力を残して最新の予定を出し、最新の etag で保存し直す', async () => {
    const { api } = GooglePrimaryChangedInGoogle.parameters.appRouter as AppRouterParameters
    if (api === undefined) throw new Error('story にフェイクの API が無い')
    const update = vi.spyOn(api.schedules, 'update')
    render(<GooglePrimaryChangedInGoogle />)

    await userEvent.click(await screen.findByTestId('schedule-field-description'))
    const description = screen.getByTestId('schedule-form-description') as HTMLTextAreaElement
    const before = description.value
    await userEvent.type(description, '追記')
    await userEvent.click(screen.getByTestId('schedule-edit-submit'))

    expect(await screen.findByTestId('schedule-edit-latest')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Google カレンダーで予定が変更されていました。最新の予定を確認してから、もう一度保存してください。',
    )
    expect(screen.getByTestId('schedule-form-description')).toHaveValue(`${before}追記`)
    await userEvent.click(screen.getByTestId('schedule-edit-submit'))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls.map((call) => call[3])).toEqual(['"etag-schedule-1"', '"etag-latest"'])
  })

  it('確認が必要な予定のほかは、予定の種類のタブを出さない', async () => {
    render(<GooglePrimary />)
    expect(await screen.findByTestId('schedule-edit-submit')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-kind-tab')).not.toBeInTheDocument()
  })

  it('訪問にすると、閉じるときに変更を破棄するかの確認を出す', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<GooglePrimaryNeedsReview />)

    await userEvent.click(await screen.findByTestId('schedule-kind-tab-visit'))
    await userEvent.click(screen.getByTestId('schedule-edit-cancel'))

    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByTestId('schedule-field-patient')).toBeInTheDocument()
  })

  it('訪問にした後に通常に戻すと、開いたときの値に戻り、閉じるときに確認を出さない', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    render(<GooglePrimaryNeedsReview />)

    await userEvent.click(await screen.findByTestId('schedule-kind-tab-visit'))
    expect(screen.getByTestId('schedule-field-patient')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('schedule-kind-tab-normal'))
    expect(screen.getByTestId('schedule-form-end-time')).toHaveValue('15:29')
    await userEvent.click(screen.getByTestId('schedule-field-title'))
    expect(screen.getByTestId('schedule-form-title')).toHaveValue('佐藤 花子 訪看I2')
    await userEvent.click(screen.getByTestId('schedule-edit-cancel'))

    expect(confirm).not.toHaveBeenCalled()
  })

  it('訪問の情報を読み取れなかった予定は、訪問にして利用者を選び、訪問の予定として保存する', async () => {
    const { api } = GooglePrimaryNeedsReview.parameters.appRouter as AppRouterParameters
    if (api === undefined) throw new Error('story にフェイクの API が無い')
    // フェイクの API の予定を書き換えると、後のテストで確認の必要な予定でなくなるので、保存は呼ばれたかだけを見る
    const update = vi
      .spyOn(api.schedules, 'update')
      .mockImplementation(async (_facilityId, scheduleId) => ({ id: scheduleId }) as Schedule)
    render(<GooglePrimaryNeedsReview />)

    expect(await screen.findByTestId('schedule-kind-tab-normal')).toBeChecked()
    await userEvent.click(screen.getByTestId('schedule-kind-tab-visit'))
    await userEvent.click(screen.getByTestId('schedule-field-patient'))
    await userEvent.click(screen.getByTestId('patient-select-option-patient-2'))
    await userEvent.click(screen.getByTestId('schedule-edit-submit'))

    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0]?.[2]).toMatchObject({
      kind: 'visit',
      staffId: 'staff-2',
      startsAt: expect.stringContaining('T15:00'),
      visit: { patientId: 'patient-2' },
    })
  })

  it('繰り返しの規則を buddy で表せない予定は、フォームを出さずに変えられないことを出す', async () => {
    render(<GooglePrimaryRecurrenceUnsupported />)
    expect(await screen.findByTestId('schedule-edit-recurrence-unsupported')).toHaveTextContent(
      'buddy では変更できません',
    )
    expect(screen.queryByTestId('schedule-edit-submit')).not.toBeInTheDocument()
  })
})
