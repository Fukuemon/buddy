import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as datePickerStories from '../DatePicker/DatePicker.stories'
import * as numberPickerStories from '../NumberPicker/NumberPicker.stories'
import * as textareaFieldStories from '../TextareaField/TextareaField.stories'
import * as timePickerStories from '../TimePicker/TimePicker.stories'

const fields = [
  { name: 'DatePicker', label: '日付', stories: composeStories(datePickerStories) },
  { name: 'TimePicker', label: '開始時間', stories: composeStories(timePickerStories) },
  { name: 'NumberPicker', label: '提供時間（分）', stories: composeStories(numberPickerStories) },
  { name: 'TextareaField', label: 'メモ', stories: composeStories(textareaFieldStories) },
] as const

describe.each(fields)('$name', ({ label, stories }) => {
  it('ラベルを名前に持ち、エラーがなければ aria-invalid を付けない', () => {
    render(<stories.Default />)
    const input = screen.getByLabelText(label)
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('エラーがあれば aria-invalid を付け、aria-describedby でエラーの文を指す', () => {
    render(<stories.WithError />)
    const input = screen.getByLabelText(label)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const message = screen.getByRole('alert')
    expect(input.getAttribute('aria-describedby')).toBe(message.id)
    expect(input).toHaveAccessibleDescription(message.textContent ?? '')
  })

  it('Tab でフォーカスが移り、押せる高さが 44px 以上ある', async () => {
    render(<stories.Default />)
    await userEvent.tab()
    const input = screen.getByLabelText(label)
    expect(input).toHaveFocus()
    const target = input.closest('label') ?? input
    expect(
      Math.max(target.getBoundingClientRect().height, input.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44)
  })
})
