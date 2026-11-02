import { composeStories, composeStory } from '@storybook/react-vite'
import type { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import { FAKE_VIEWER } from '#/api/fake/fixtures'
import { queryKeys } from '#/api/queryKeys'

import * as stories from './StaffCreateDialogContainer.stories'

const { Default, OptionsError } = composeStories(stories)

/** 描く前の query の cache を受け取る Default の story を作る。 */
const seeded = (seed: (queryClient: QueryClient) => void) =>
  composeStory(
    {
      ...stories.Default,
      parameters: { appRouter: { ...stories.default.parameters.appRouter, seed } },
    },
    stories.default,
  )

const fill = async (name: string, email: string, phone = '') => {
  await userEvent.type(await screen.findByTestId('staff-new-name'), name)
  await userEvent.type(screen.getByTestId('staff-new-email'), email)
  if (phone !== '') await userEvent.type(screen.getByTestId('staff-new-phone'), phone)
}

describe('StaffCreateDialogContainer', () => {
  it('開くと名前の欄にフォーカスを置き、部署、チーム、役職は名前の順の最初のものを選ぶ', async () => {
    render(<Default />)
    expect(await screen.findByTestId('staff-new-name')).toHaveFocus()
    expect(await screen.findByTestId('staff-new-position')).toHaveDisplayValue('マネージャー')
    expect(screen.getByTestId('staff-new-department')).toHaveDisplayValue('リハビリ部')
  })

  it('訪問は「訪問する」を選んで始め、役職を変えても選び直さない', async () => {
    render(<Default />)
    expect(await screen.findByTestId('staff-new-visits-visits')).toBeChecked()
    await userEvent.click(screen.getByTestId('staff-new-visits-non-visiting'))
    await userEvent.selectOptions(screen.getByTestId('staff-new-position'), '看護師')
    expect(screen.getByTestId('staff-new-visits-non-visiting')).toBeChecked()
  })

  it('名前が空でメールアドレスの形でなければ、送らずに欄ごとの誤りを出し、直すと消す', async () => {
    render(<Default />)
    await fill(' ', 'aoki', '090-1234')
    await userEvent.click(screen.getByTestId('staff-new-submit'))
    expect(screen.getByTestId('staff-new-error-name')).toHaveTextContent('名前を入れてください')
    expect(screen.getByTestId('staff-new-error-email')).toHaveTextContent(
      'メールアドレスの形で入れてください',
    )
    expect(screen.getByTestId('staff-new-error-phone')).toHaveTextContent(
      '電話番号は数字で 11 桁まで入れてください',
    )
    await userEvent.type(screen.getByTestId('staff-new-name'), '新井')
    expect(screen.queryByTestId('staff-new-error-name')).toBeNull()
  })

  it('同じメールアドレスの職員がいれば、ダイアログを閉じずに理由を出し、入れた値を残す', async () => {
    render(<Default />)
    await fill('新井 五月', 'staff-2@example.com')
    await userEvent.click(screen.getByTestId('staff-new-submit'))
    expect(await screen.findByTestId('staff-new-submit-error')).toHaveTextContent(
      'このメールアドレスの職員は、すでに登録されています。',
    )
    expect(screen.getByTestId('staff-new-name')).toHaveValue('新井 五月')
  })

  it('登録できたら、ダイアログを閉じる', async () => {
    render(<Default />)
    await fill('新井 五月', 'satsuki.arai@example.com', '09012345678')
    await userEvent.click(screen.getByTestId('staff-new-submit'))
    await expect.poll(() => screen.queryByTestId('staff-new-dialog')).toBeNull()
  })

  it('登録できたら、職員の管理の一覧と、予定の画面の名前で絞った職員の一覧を invalidate する', async () => {
    const { facilityId } = FAKE_VIEWER
    const keys = [
      queryKeys.staff.records(facilityId),
      queryKeys.staff.list(facilityId, { name: '新井' }),
    ]
    let client: QueryClient | undefined
    const Story = seeded((queryClient) => {
      client = queryClient
      for (const key of keys) queryClient.setQueryData(key, [])
    })
    render(<Story />)
    await fill('新井 五月', 'satsuki.arai@example.com')
    await userEvent.click(screen.getByTestId('staff-new-submit'))
    await expect.poll(() => screen.queryByTestId('staff-new-dialog')).toBeNull()
    for (const key of keys) expect(client?.getQueryState(key)?.isInvalidated).toBe(true)
  })

  it('選択肢を読めなければ、登録を押せず、開き直すよう伝える', async () => {
    render(<OptionsError />)
    expect(await screen.findByTestId('staff-new-submit-error')).toHaveTextContent(
      '部署、チーム、役職を読み込めませんでした。閉じてから、開き直してください。',
    )
    expect(screen.getByTestId('staff-new-submit')).toHaveAttribute('aria-disabled', 'true')
  })
})
