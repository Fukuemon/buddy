import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './FormField.stories'

const { Default, WithHint, Invalid, WithHintAndError, Group } = composeStories(stories)

// packages/ui/DESIGN.md の規則の `gap-3`（12px）。focus-ring が欄の外へ 6px 広がっても、文字に重ならない間である
const FIELD_TEXT_MIN_GAP = 12

describe('FormField', () => {
  it('見出しを欄に結び付け、誤りが無ければ aria-invalid を付けない', () => {
    render(<Default />)
    const input = screen.getByRole('textbox', { name: '名前' })
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('補足の文を aria-describedby で欄に結び付ける', () => {
    render(<WithHint />)
    expect(screen.getByRole('combobox', { name: '担当の職員' })).toHaveAccessibleDescription(
      '休職と退職の職員は選べません。',
    )
  })

  it('誤りがあれば欄に aria-invalid を付け、誤りの文を割り込みで読み上げずに欄に結び付ける', () => {
    render(<Invalid />)
    const input = screen.getByRole('textbox', { name: '名前' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('名前を入れてください')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('isGroup では見出しで組を名付け、組に誤りを結び付ける', () => {
    render(<Group />)
    const group = screen.getByRole('radiogroup', { name: '希望の時間帯' })
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(group).toHaveAccessibleDescription('希望の時間帯を選んでください')
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('見出しと補足の文と誤りの文を、欄から gap-3（12px）以上離す', () => {
    render(<WithHintAndError />)
    const field = screen.getByRole('textbox', { name: 'メールアドレス' }).getBoundingClientRect()
    const label = screen.getByText('メールアドレス', { selector: 'label' }).getBoundingClientRect()
    const hint = screen.getByText('ログインに使うメールアドレスです。').getBoundingClientRect()
    expect(field.top - label.bottom).toBeGreaterThanOrEqual(FIELD_TEXT_MIN_GAP)
    expect(hint.top - field.bottom).toBeGreaterThanOrEqual(FIELD_TEXT_MIN_GAP)
  })

  it('欄は 44 px 以上の高さで描く', () => {
    render(<Default />)
    expect(screen.getByRole('textbox').getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })
})
