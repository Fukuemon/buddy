import { composeStories } from '@storybook/react-vite'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { mockServiceCodes } from '#/mocks/scheduleData'
import type { AppRouterParameters } from '#/storybook/withAppRouter'

import * as stories from './ScheduleCreateModalContainer.stories'

const {
  FromOnLeaveStaffSlot,
  FromSlot,
  GooglePrimary,
  GooglePrimaryWriteUnknown,
  NormalFromSlot,
  PatientServiceCodeUnlisted,
  SelfEditOnly,
  Visit,
  WithSuspendedStaff,
} = composeStories(stories)

describe('ScheduleCreateModalContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('日付を変えてから種類を切り替えて閉じると、破棄の確認を出す', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Visit />)

    fireEvent.change(await screen.findByTestId('schedule-form-date'), {
      target: { value: '2000-01-01' },
    })
    await userEvent.click(screen.getByTestId('schedule-kind-tab-normal'))
    expect(screen.getByTestId('schedule-form-date')).toHaveValue('2000-01-01')
    await userEvent.click(screen.getByTestId('schedule-new-cancel'))

    expect(confirm).toHaveBeenCalledOnce()
  })

  it('開始時間を変えてから通常に切り替えると、終了時間を新しい開始時間の 1 時間後にする', async () => {
    render(<Visit />)

    fireEvent.change(await screen.findByTestId('schedule-form-start-time'), {
      target: { value: '13:00' },
    })
    await userEvent.click(screen.getByTestId('schedule-kind-tab-normal'))

    expect(screen.getByTestId('schedule-form-end-time')).toHaveValue('14:00')
  })

  it('変えた日付を元に戻してから種類を切り替えて閉じると、確認を出さない', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Visit />)

    const date = await screen.findByTestId('schedule-form-date')
    const opened = (date as HTMLInputElement).value
    fireEvent.change(date, { target: { value: '2000-01-01' } })
    fireEvent.change(date, { target: { value: opened } })
    await userEvent.click(screen.getByTestId('schedule-kind-tab-normal'))
    await userEvent.click(screen.getByTestId('schedule-new-cancel'))

    expect(confirm).not.toHaveBeenCalled()
  })

  it('入力を変えずに種類を切り替えて閉じると、確認を出さない', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Visit />)

    await userEvent.click(await screen.findByTestId('schedule-kind-tab-normal'))
    await userEvent.click(screen.getByTestId('schedule-new-cancel'))

    expect(confirm).not.toHaveBeenCalled()
  })

  it('自分の予定だけを編集できる職員には、主訪問者の候補に自分だけを出す', async () => {
    render(<SelfEditOnly />)

    await userEvent.click(await screen.findByTestId('schedule-field-staff'))
    expect(screen.getByTestId('staff-select-option-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-select-option-staff-2')).not.toBeInTheDocument()
  })

  it('サービスコードを、予定の API の一覧の順に並べる', async () => {
    render(<Visit />)

    const codes = (await screen.findAllByRole('radio', { name: /^(訪看|予防看|医)/ })).map(
      (radio) => radio.getAttribute('value'),
    )
    expect(codes).toEqual(mockServiceCodes.map((code) => code.code))
  })

  it('利用者を選ぶと、その利用者のサービスコードを選び、提供時間をそのコードの上限にする', async () => {
    render(<Visit />)

    await userEvent.click(await screen.findByTestId('schedule-field-patient'))
    await userEvent.click(await screen.findByTestId('patient-select-option-patient-2'))
    await userEvent.click(screen.getByTestId('schedule-field-date-time'))

    expect(screen.getByTestId('service-code-訪看I3')).toBeChecked()
    expect(screen.getByTestId('schedule-form-service-time')).toHaveValue(59)
  })

  it('サービスコードを手で選んだ後に利用者を選んでも、サービスコードと提供時間を変えない', async () => {
    render(<Visit />)

    await userEvent.click(await screen.findByTestId('service-code-訪看I4'))
    await userEvent.click(screen.getByTestId('schedule-field-patient'))
    await userEvent.click(await screen.findByTestId('patient-select-option-patient-2'))
    await userEvent.click(screen.getByTestId('schedule-field-date-time'))

    expect(screen.getByTestId('service-code-訪看I4')).toBeChecked()
    expect(screen.getByTestId('schedule-form-service-time')).toHaveValue(89)
  })

  it('サービスコードを手で選んでから種類を切り替えて戻ると、利用者を選んだときにその利用者のサービスコードを選ぶ', async () => {
    render(<Visit />)

    await userEvent.click(await screen.findByTestId('service-code-訪看I4'))
    await userEvent.click(screen.getByTestId('schedule-kind-tab-normal'))
    await userEvent.click(screen.getByTestId('schedule-kind-tab-visit'))
    await userEvent.click(screen.getByTestId('schedule-field-patient'))
    await userEvent.click(await screen.findByTestId('patient-select-option-patient-2'))
    await userEvent.click(screen.getByTestId('schedule-field-date-time'))

    expect(screen.getByTestId('service-code-訪看I3')).toBeChecked()
  })

  it('サービスコードが事業所の一覧に無い利用者に替えると、サービスコードを訪看I2 にする', async () => {
    render(<PatientServiceCodeUnlisted />)

    await userEvent.click(await screen.findByTestId('schedule-field-patient'))
    await userEvent.click(await screen.findByTestId('patient-select-option-patient-2'))
    await userEvent.click(screen.getByTestId('patient-select-option-patient-3'))
    await userEvent.click(screen.getByTestId('schedule-field-date-time'))

    expect(screen.getByTestId('service-code-訪看I2')).toBeChecked()
    expect(screen.getByTestId('schedule-form-service-time')).toHaveValue(29)
  })

  it('止めた職員がいる事業所では、主訪問者の候補に止めた職員を出さない', async () => {
    render(<WithSuspendedStaff />)

    await userEvent.click(await screen.findByTestId('schedule-field-staff'))
    expect(screen.getByTestId('staff-select-option-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-select-option-staff-2')).not.toBeInTheDocument()
  })

  it('URL の staffId が休職の職員を指すときは、主訪問者を未選択で開く', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<FromOnLeaveStaffSlot />)

    // 職員の一覧を取り終えるまで、主訪問者は値に関わらず未選択に見えるので、候補が出てから確認する
    await userEvent.click(await screen.findByTestId('schedule-field-staff'))
    await screen.findByTestId('staff-select-option-staff-1')
    await waitFor(() =>
      expect(screen.getByTestId('schedule-field-staff')).toHaveTextContent('選んでください'),
    )
    await userEvent.click(screen.getByTestId('schedule-new-cancel'))
    expect(confirm).not.toHaveBeenCalled()
  })

  it('URL の staffId が有効な職員を指すときは、その職員を選んで開く', async () => {
    render(<FromSlot />)

    await waitFor(() =>
      expect(screen.getByTestId('schedule-field-staff')).toHaveTextContent('石川 二葉'),
    )
  })

  it('google_primary の事業所でも、予定の作成のフォームを出す', async () => {
    render(<GooglePrimary />)
    expect(await screen.findByTestId('schedule-create-submit')).toBeInTheDocument()
  })

  it('Google カレンダーに書けたかを確認できなければ、送り直せることを示し、送り直しでも同じ予定の ID を送る', async () => {
    const { api } = GooglePrimaryWriteUnknown.parameters.appRouter as AppRouterParameters
    if (api === undefined) throw new Error('story にフェイクの API が無い')
    const create = vi.spyOn(api.schedules, 'create')
    render(<GooglePrimaryWriteUnknown />)

    await userEvent.click(await screen.findByTestId('schedule-field-title'))
    await userEvent.type(screen.getByTestId('schedule-form-title'), '研修')
    await userEvent.click(screen.getByTestId('schedule-create-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'もう一度「作成」を押すと、同じ予定として送り直します。',
    )
    await userEvent.click(screen.getByTestId('schedule-create-submit'))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
    const [first, second] = create.mock.calls.map((call) => call[2])
    expect(first).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/)
    expect(second).toBe(first)
  })

  describe('繰り返し', () => {
    const fillTitle = async () => {
      await userEvent.click(await screen.findByTestId('schedule-field-title'))
      await userEvent.type(screen.getByTestId('schedule-form-title'), '研修')
    }
    const spyApi = () => {
      const { api } = NormalFromSlot.parameters.appRouter as AppRouterParameters
      if (api === undefined) throw new Error('story にフェイクの API が無い')
      return {
        create: vi.spyOn(api.schedules, 'create'),
        createRecurring: vi.spyOn(api.schedules, 'createRecurring'),
      }
    }

    it('「繰り返しの予定にする」を選ばずに作成すると、単発の予定を作る', async () => {
      const { create, createRecurring } = spyApi()
      render(<NormalFromSlot />)
      expect(await screen.findByTestId('schedule-field-recurrence')).toHaveTextContent(
        '繰り返さない',
      )
      await fillTitle()
      await userEvent.click(screen.getByTestId('schedule-create-submit'))

      await waitFor(() => expect(create).toHaveBeenCalledOnce())
      expect(createRecurring).not.toHaveBeenCalled()
    })

    it('「繰り返しの予定にする」を選んで作成すると、日付の曜日の毎週の繰り返しの予定を作る', async () => {
      const { create, createRecurring } = spyApi()
      render(<NormalFromSlot />)
      await fillTitle()
      await userEvent.click(screen.getByTestId('schedule-field-recurrence'))
      await userEvent.click(screen.getByTestId('schedule-form-repeats'))
      expect(screen.getByTestId('schedule-field-recurrence')).toHaveTextContent('毎週 水曜日')
      await userEvent.click(screen.getByTestId('schedule-create-submit'))

      await waitFor(() => expect(createRecurring).toHaveBeenCalledOnce())
      const [, input, rule, id] = createRecurring.mock.calls[0]
      expect(input.startsAt.slice(0, 10)).toBe('2026-10-21')
      expect(rule).toEqual({
        frequency: 'weekly',
        daysOfWeek: [3],
        interval: 1,
        dayOfWeek: null,
        dayOfMonth: null,
        weekOfMonth: null,
        endDate: null,
      })
      expect(id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/)
      expect(create).not.toHaveBeenCalled()
    })

    it('カスタムで曜日を足し、間隔を 2 にすると、隔週の複数の曜日の繰り返しの予定を作る', async () => {
      const { createRecurring } = spyApi()
      render(<NormalFromSlot />)
      await fillTitle()
      await userEvent.click(screen.getByTestId('schedule-field-recurrence'))
      await userEvent.click(screen.getByTestId('schedule-form-repeats'))
      await userEvent.selectOptions(screen.getByTestId('recurring-rule-preset'), 'custom')
      await userEvent.click(screen.getByTestId('recurring-rule-day-of-week-5'))
      await userEvent.clear(screen.getByTestId('recurring-rule-interval'))
      await userEvent.type(screen.getByTestId('recurring-rule-interval'), '2')
      expect(screen.getByTestId('schedule-field-recurrence')).toHaveTextContent(
        '隔週 水曜日、金曜日',
      )
      await userEvent.click(screen.getByTestId('schedule-create-submit'))

      await waitFor(() => expect(createRecurring).toHaveBeenCalledOnce())
      expect(createRecurring.mock.calls[0][2]).toMatchObject({ daysOfWeek: [3, 5], interval: 2 })
    })

    it('日付が繰り返しの回に当たらなければ、理由を出して送らない', async () => {
      const { createRecurring } = spyApi()
      render(<NormalFromSlot />)
      await fillTitle()
      await userEvent.click(screen.getByTestId('schedule-field-recurrence'))
      await userEvent.click(screen.getByTestId('schedule-form-repeats'))
      await userEvent.selectOptions(screen.getByTestId('recurring-rule-preset'), 'custom')
      await userEvent.click(screen.getByTestId('recurring-rule-day-of-week-4'))
      await userEvent.click(screen.getByTestId('recurring-rule-day-of-week-3'))
      await userEvent.click(screen.getByTestId('schedule-create-submit'))

      expect(await screen.findByTestId('schedule-field-recurrence')).toHaveTextContent(
        '日付が繰り返しの回に当たりません。日付か繰り返しを変えてください',
      )
      expect(createRecurring).not.toHaveBeenCalled()
    })

    it('終了日が日付より前なら、理由を出して送らない', async () => {
      const { createRecurring } = spyApi()
      render(<NormalFromSlot />)
      await fillTitle()
      await userEvent.click(screen.getByTestId('schedule-field-recurrence'))
      await userEvent.click(screen.getByTestId('schedule-form-repeats'))
      await userEvent.click(screen.getByTestId('recurring-rule-ends-on'))
      fireEvent.change(screen.getByTestId('recurring-rule-end-date'), {
        target: { value: '2026-10-20' },
      })
      await userEvent.click(screen.getByTestId('schedule-create-submit'))

      expect(await screen.findByTestId('schedule-field-recurrence')).toHaveTextContent(
        '終了日は日付以降にしてください',
      )
      expect(createRecurring).not.toHaveBeenCalled()
    })

    it('日付を変えると、日付から作った選択肢の繰り返しを、新しい日付の曜日にする', async () => {
      render(<NormalFromSlot />)
      await userEvent.click(await screen.findByTestId('schedule-field-recurrence'))
      await userEvent.click(screen.getByTestId('schedule-form-repeats'))
      await userEvent.click(screen.getByTestId('schedule-field-date-time'))
      fireEvent.change(screen.getByTestId('schedule-form-date'), {
        target: { value: '2026-10-22' },
      })

      expect(screen.getByTestId('schedule-field-recurrence')).toHaveTextContent('毎週 木曜日')
    })
  })
})
