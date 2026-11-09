import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './InputDialog.stories'

const { Default, CannotSubmit, Submitting, WithError, WithTitleAddon } = composeStories(stories)

describe('InputDialog', () => {
  it('タイトルを名前にしたダイアログで開き、testid を接頭辞から付ける', () => {
    render(<Default />)
    expect(screen.getByRole('dialog', { name: '予定の理由を直す' })).toHaveAttribute(
      'data-testid',
      'reason-dialog',
    )
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveAttribute(
      'data-testid',
      'reason-cancel',
    )
    expect(screen.getByRole('button', { name: '保存' })).toHaveAttribute(
      'data-testid',
      'reason-submit',
    )
  })

  it('右上に閉じるボタン（×）を置かず、開くと最初の欄にフォーカスを移す', () => {
    render(<Default />)
    expect(screen.queryByRole('button', { name: '閉じる' })).toBeNull()
    expect(screen.getByRole('textbox', { name: '理由' })).toHaveFocus()
  })

  it('initialFocusRef を渡すと、開いたときにその欄にフォーカスを移す', () => {
    const WithInitialFocus = () => {
      const nameRef = useRef<HTMLInputElement>(null)
      return (
        <Default initialFocusRef={nameRef}>
          <input aria-label="名前" ref={nameRef} />
        </Default>
      )
    }
    render(<WithInitialFocus />)
    expect(screen.getByRole('textbox', { name: '名前' })).toHaveFocus()
  })

  it('「キャンセル」と Escape で onClose を呼ぶ', async () => {
    const onClose = fn()
    render(<Default onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('送っている間は、「キャンセル」と Escape で onClose を呼ばず、確定のボタンも押せない', async () => {
    const onClose = fn()
    const onSubmit = fn()
    render(<Submitting onClose={onClose} onSubmit={onSubmit} />)
    const submit = screen.getByRole('button', { name: '保存しています' })
    expect(submit).toHaveAttribute('aria-disabled', 'true')

    // Playwright は aria-disabled の要素を押せないものとして待つので、force で押す
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }), { force: true })
    await userEvent.keyboard('{Escape}')
    await userEvent.click(submit, { force: true })
    expect(onClose).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveProperty('open', true)
  })

  it('確定のボタンで onSubmit を呼ぶ', async () => {
    const onSubmit = fn()
    render(<Default onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('canSubmit が false の間は、確定のボタンを押しても onSubmit を呼ばない', async () => {
    const onSubmit = fn()
    render(<CannotSubmit onSubmit={onSubmit} />)
    const submit = screen.getByRole('button', { name: '保存' })
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(submit, { force: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('canSubmit が false の間は、submitHint の文をボタンの上に出し、ボタンの説明にする', () => {
    render(<CannotSubmit />)
    expect(screen.getByTestId('reason-submit-hint')).toHaveTextContent('理由を入れてください。')
    expect(screen.getByRole('button', { name: '保存' })).toHaveAccessibleDescription(
      '理由を入れてください。',
    )
  })

  it('押せるときと送っている間は、submitHint の文を出さない', () => {
    const { rerender } = render(<CannotSubmit canSubmit />)
    expect(screen.queryByTestId('reason-submit-hint')).toBeNull()
    rerender(<CannotSubmit isSubmitting />)
    expect(screen.queryByTestId('reason-submit-hint')).toBeNull()
  })

  it('formId を渡すと、確定のボタンでその form を送る', async () => {
    const onFormSubmit = fn((event: SubmitEvent) => event.preventDefault())
    render(
      <Default formId="reason-form" onSubmit={undefined}>
        <form id="reason-form" onSubmit={(event) => onFormSubmit(event.nativeEvent as SubmitEvent)}>
          <label>
            理由
            <input defaultValue="利用者の都合" />
          </label>
        </form>
      </Default>,
    )
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onFormSubmit).toHaveBeenCalledTimes(1)
  })

  it('送れなかったときの文を role="alert" で出す', () => {
    render(<WithError />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      '保存できませんでした。もう一度お試しください。',
    )
    expect(screen.getByTestId('reason-error')).toBeInTheDocument()
  })

  it('タイトルの右のヘルプは、Escape で説明だけを閉じ、ダイアログを閉じない', async () => {
    const onClose = fn()
    render(<WithTitleAddon onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'ヘルプ' }))
    expect(screen.getByTestId('reason-help-text')).toBeVisible()

    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('reason-help-text')).not.toBeVisible()
    expect(onClose).not.toHaveBeenCalled()
  })
})
