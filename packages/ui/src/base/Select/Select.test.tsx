import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './Select.stories'

const { Default, LongOption, WithError } = composeStories(stories)

/** 矢印の印。select の次に置く。 */
const arrowOf = (select: HTMLElement) => {
  const arrow = select.nextElementSibling
  if (arrow === null) throw new Error('矢印の印が無い')
  return arrow
}

describe('Select', () => {
  it('見出しを欄に結び付け、標準の矢印を消す', () => {
    render(<Default />)
    const select = screen.getByLabelText('担当の職員')
    expect(select).toHaveValue('aoki')
    expect(getComputedStyle(select).appearance).toBe('none')
    expect(select).not.toHaveAttribute('aria-invalid')
  })

  it('矢印の印を、欄の右の端から 12px の位置に置く', () => {
    render(<Default />)
    const select = screen.getByLabelText('担当の職員')
    const box = select.getBoundingClientRect()
    const arrow = arrowOf(select).getBoundingClientRect()
    expect(Math.round(box.right - arrow.right)).toBe(12)
  })

  it('長い選択肢を選んでも、文字の領域が矢印の印の手前で終わる', () => {
    render(<LongOption />)
    const select = screen.getByLabelText('担当の職員')
    const box = select.getBoundingClientRect()
    const textRight = box.right - Number.parseFloat(getComputedStyle(select).paddingRight)
    expect(textRight).toBeLessThanOrEqual(arrowOf(select).getBoundingClientRect().left)
  })

  it('欄は 44 px 以上の高さで描く', () => {
    render(<Default />)
    expect(
      screen.getByLabelText('担当の職員').getBoundingClientRect().height,
    ).toBeGreaterThanOrEqual(44)
  })

  it('選択肢を選ぶと、欄の値が変わる', async () => {
    render(<Default />)
    const select = screen.getByLabelText('担当の職員')
    await userEvent.selectOptions(select, 'mori')
    expect(select).toHaveValue('mori')
  })

  it('誤りがあれば aria-invalid を付け、誤りの文を欄に結び付ける', () => {
    render(<WithError />)
    const select = screen.getByLabelText('担当の職員')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription(/担当の職員を選んでください/)
  })
})
