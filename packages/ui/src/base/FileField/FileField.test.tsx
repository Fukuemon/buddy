import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './FileField.stories'

const { Default, WithError } = composeStories(stories)

describe('FileField', () => {
  it('見出しと補足の文を欄に結び付ける', () => {
    render(<Default />)
    const input = screen.getByLabelText('実績の CSV')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAccessibleDescription('CSV のファイル。10 MB まで。')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('選んだファイルを onFileChange に渡す', async () => {
    const onFileChange = fn()
    render(<Default onFileChange={onFileChange} />)
    const file = new File(['訪問日'], 'visits.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText('実績の CSV'), file)
    expect(onFileChange).toHaveBeenCalledWith(file)
  })

  it('誤りがあれば aria-invalid を付け、誤りの文を欄に結び付ける', () => {
    render(<WithError />)
    expect(screen.getByLabelText('実績の CSV')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('実績の CSV')).toHaveAccessibleDescription(
      /CSV のファイルを選んでください/,
    )
  })

  it('欄は 44 px 以上の高さで描く', () => {
    render(<Default />)
    expect(
      screen.getByLabelText('実績の CSV').getBoundingClientRect().height,
    ).toBeGreaterThanOrEqual(44)
  })
})
