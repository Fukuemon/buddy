import { composeStories } from '@storybook/react-vite'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AppRouterParameters } from '#/storybook/withAppRouter'

import * as stories from './ScheduleEditModalContainer.stories'

const { Cancelled, SuspendedStaff } = composeStories(stories)

describe('ScheduleEditModalContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('キャンセルした予定の編集の URL では、フォームを出さずに案内の文を出す', async () => {
    render(<Cancelled />)
    expect(await screen.findByText('キャンセルした予定は編集できません。')).toBeInTheDocument()
    expect(screen.queryByTestId('schedule-edit-submit')).not.toBeInTheDocument()
  })

  it('止めた職員に割り振った予定では、担当者の名前を出したまま、候補に止めた職員を出さない', async () => {
    render(<SuspendedStaff />)

    const staffField = await screen.findByTestId('schedule-field-staff')
    expect(within(staffField).getByText('石川 二葉')).toBeInTheDocument()
    await userEvent.click(staffField)
    expect(screen.getByTestId('staff-select-option-staff-1')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-select-option-staff-2')).not.toBeInTheDocument()
  })

  it('止めた職員に割り振った予定を担当者を選ばずに保存すると、担当者を変えずに送る', async () => {
    const { api } = SuspendedStaff.parameters.appRouter as AppRouterParameters
    if (api === undefined) throw new Error('story にフェイクの API が無い')
    // story の間で共有するフェイクの API の予定を書き換えるので、このテストをファイルの最後に置く
    const update = vi.spyOn(api.schedules, 'update')
    render(<SuspendedStaff />)

    await userEvent.click(await screen.findByTestId('schedule-edit-submit'))

    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0]?.[2]).toMatchObject({ staffId: 'staff-2' })
  })
})
