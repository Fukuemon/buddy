import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './Dialog.stories'

const { Default, WithError, Submitting } = composeStories(stories)

describe('Dialog', () => {
  it('モーダルのダイアログとして開き、タイトルを名前にする', () => {
    render(<Default />)
    const dialog = screen.getByRole('dialog', { name: '予定の理由を直す' })
    expect(dialog).toHaveProperty('open', true)
    expect(dialog.matches(':modal')).toBe(true)
  })

  it('Escape と覆いで onClose を呼ぶ', async () => {
    const onClose = fn()
    render(<Default onClose={onClose} />)
    // 覆い（::backdrop）は、dialog の上端の外側に見えている
    await userEvent.click(screen.getByRole('dialog'), { position: { x: 20, y: -4 }, force: true })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('dialog')).toHaveProperty('open', true)
  })

  it('中身を押しても onClose を呼ばない', async () => {
    const onClose = fn()
    render(<Default onClose={onClose} />)
    await userEvent.click(screen.getByRole('textbox', { name: '理由' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('canClose が false の間は、Escape と覆いで onClose を呼ばず、開いたままにする', async () => {
    const onClose = fn()
    render(<Submitting onClose={onClose} />)
    await userEvent.click(screen.getByRole('dialog'), { position: { x: 20, y: -4 }, force: true })
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveProperty('open', true)
  })

  it('ヘッダーの閉じるボタンで onClose を呼ぶ', async () => {
    const onClose = fn()
    render(<Default onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('isCloseDisabled の間は、ヘッダーの閉じるボタンを押しても onClose を呼ばない', async () => {
    const onClose = fn()
    render(<Submitting onClose={onClose} />)
    const close = screen.getByRole('button', { name: '閉じる' })
    expect(close).toHaveAttribute('aria-disabled', 'true')
    // Playwright は aria-disabled の要素を押せないものとして待つので、force で押す
    await userEvent.click(close, { force: true })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('送れなかったときの文を role="alert" で出す', () => {
    render(<WithError />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      '保存できませんでした。もう一度お試しください。',
    )
  })

  it('閉じるボタンは 44×44 px 以上を押せる', () => {
    render(<Default />)
    const rect = screen.getByRole('button', { name: '閉じる' }).getBoundingClientRect()
    expect(rect.width).toBeGreaterThanOrEqual(44)
    expect(rect.height).toBeGreaterThanOrEqual(44)
  })
})
