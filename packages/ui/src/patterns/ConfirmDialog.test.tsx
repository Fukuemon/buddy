import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './ConfirmDialog.stories'

const { Default, Submitting, CancelAction, WithError } = composeStories(stories)

describe('ConfirmDialog', () => {
  it('問いの形のタイトルを名前にした alertdialog で開き、× を置かない', () => {
    render(<Default />)
    expect(screen.getByRole('alertdialog', { name: 'カレンダーを外しますか' })).toHaveAttribute(
      'data-testid',
      'calendar-remove-dialog',
    )
    expect(screen.queryByRole('button', { name: '閉じる' })).not.toBeInTheDocument()
  })

  it('開くと、「キャンセル」にフォーカスを移す', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()
  })

  it('確定のボタンを danger にし、押すと onSubmit を呼ぶ', async () => {
    const onSubmit = fn()
    render(<Default onSubmit={onSubmit} />)
    const submit = screen.getByRole('button', { name: '外す' })
    expect(submit).toHaveClass('bg-danger')
    await userEvent.click(submit)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('「キャンセル」と Escape で onCancel を呼ぶ', async () => {
    const onCancel = fn()
    render(<Default onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('送っている間は、「キャンセル」と Escape で onCancel を呼ばない', async () => {
    const onCancel = fn()
    render(<Submitting onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: '外しています' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    // Playwright は aria-disabled の要素を押せないものとして待つので、force で押す
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }), { force: true })
    await userEvent.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveProperty('open', true)
  })

  it('cancelLabel を渡すと、閉じる側のボタンをその文字にし、押すと onCancel を呼ぶ', async () => {
    const onCancel = fn()
    render(<CancelAction onCancel={onCancel} />)
    expect(screen.queryByRole('button', { name: 'キャンセル' })).not.toBeInTheDocument()
    const back = screen.getByRole('button', { name: '戻る' })
    expect(back).toHaveFocus()
    await userEvent.click(back)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('送れなかったときの文を role="alert" で出す', () => {
    render(<WithError />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      '外せませんでした。もう一度お試しください。',
    )
  })
})
