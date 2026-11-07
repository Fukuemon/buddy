import { composeStories } from '@storybook/react-vite'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AppRouterParameters } from '#/storybook/withAppRouter'

import * as stories from './ScheduleEditModalContainer.stories'

const {
  Cancelled,
  Forbidden,
  GooglePrimary,
  GooglePrimaryChangedInGoogle,
  GooglePrimaryFromOtherDay,
  GooglePrimaryRecurrenceUnsupported,
  NotFound,
  SuspendedStaff,
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

  it('繰り返しの規則を buddy で表せない予定は、フォームを出さずに変えられないことを出す', async () => {
    render(<GooglePrimaryRecurrenceUnsupported />)
    expect(await screen.findByTestId('schedule-edit-recurrence-unsupported')).toHaveTextContent(
      'buddy では変更できません',
    )
    expect(screen.queryByTestId('schedule-edit-submit')).not.toBeInTheDocument()
  })
})
