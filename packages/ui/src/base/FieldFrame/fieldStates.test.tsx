import { composeStories } from '@storybook/react-vite'
import type { ComponentType } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as searchBoxStories from '../../case/SearchBox/SearchBox.stories'
import * as datePickerStories from '../DatePicker/DatePicker.stories'
import * as fileFieldStories from '../FileField/FileField.stories'
import * as formFieldStories from '../FormField/FormField.stories'
import * as monthPickerStories from '../MonthPicker/MonthPicker.stories'
import * as numberPickerStories from '../NumberPicker/NumberPicker.stories'
import * as textareaFieldStories from '../TextareaField/TextareaField.stories'
import * as timePickerStories from '../TimePicker/TimePicker.stories'

const formField = composeStories(formFieldStories)
const searchBox = composeStories(searchBoxStories)

type StoryComponent = ComponentType<Record<string, never>>

/** 状態ごとの story。SearchBox は誤りの状態を持たないので Invalid を省く。 */
const fields: {
  name: string
  label: string
  Default: StoryComponent
  Invalid: StoryComponent | undefined
  Disabled: StoryComponent
}[] = [
  {
    name: 'FormField',
    label: '名前',
    Default: formField.Default,
    Invalid: formField.Invalid,
    Disabled: formField.Disabled,
  },
  { name: 'DatePicker', label: '日付', ...pick(composeStories(datePickerStories)) },
  { name: 'TimePicker', label: '開始時間', ...pick(composeStories(timePickerStories)) },
  { name: 'NumberPicker', label: '提供時間（分）', ...pick(composeStories(numberPickerStories)) },
  { name: 'TextareaField', label: 'メモ', ...pick(composeStories(textareaFieldStories)) },
  { name: 'MonthPicker', label: '対象の月', ...pick(composeStories(monthPickerStories)) },
  { name: 'FileField', label: '実績の CSV', ...pick(composeStories(fileFieldStories)) },
  {
    name: 'SearchBox',
    label: '職員を検索',
    Default: searchBox.Default,
    Invalid: undefined,
    Disabled: searchBox.Disabled,
  },
]

function pick(stories: Record<'Default' | 'WithError' | 'Disabled', StoryComponent>) {
  return { Default: stories.Default, Invalid: stories.WithError, Disabled: stories.Disabled }
}

/** 枠を引く要素。input に枠がなければ、枠を持つ外側の label。 */
const frameOf = (label: string) => {
  const input = screen.getByLabelText(label)
  return getComputedStyle(input).borderTopWidth === '0px'
    ? (input.closest('label') ?? input)
    : input
}

const borderOf = (element: Element) => getComputedStyle(element).borderTopColor

// FieldFrame の枠は色を 100ms で移すので、移り終えてから読む
const TRANSITION_MS = 200
const settle = () => new Promise((resolve) => setTimeout(resolve, TRANSITION_MS))

describe.each(fields)('$name の状態', ({ label, Default, Invalid, Disabled }) => {
  it('マウスを乗せると枠の色が変わり、外すと戻る', async () => {
    render(<Default />)
    const frame = frameOf(label)
    const before = borderOf(frame)
    await userEvent.hover(frame)
    await settle()
    expect(borderOf(frame)).not.toBe(before)
    await userEvent.unhover(frame)
    await settle()
    expect(borderOf(frame)).toBe(before)
  })

  it('無効の欄は、マウスを乗せても枠の色を変えない', async () => {
    render(<Disabled />)
    const frame = frameOf(label)
    const before = borderOf(frame)
    await userEvent.hover(frame)
    await settle()
    expect(borderOf(frame)).toBe(before)
  })

  it.runIf(Invalid !== undefined)(
    '誤りのある欄は、マウスを乗せると誤りの枠の濃い色にする',
    async () => {
      if (Invalid === undefined) return
      const { unmount } = render(<Default />)
      const fieldHover = await hovered(frameOf(label))
      unmount()
      render(<Invalid />)
      const frame = frameOf(label)
      const before = borderOf(frame)
      const after = await hovered(frame)
      expect(after).not.toBe(before)
      expect(after).not.toBe(fieldHover)
    },
  )

  it.runIf(Invalid !== undefined)(
    '誤りのある欄にフォーカスしても、誤りのない欄と同じフォーカスの表示を出す',
    async () => {
      if (Invalid === undefined) return
      const { unmount } = render(<Default />)
      const focusRing = await focused(frameOf(label))
      unmount()
      render(<Invalid />)
      expect(await focused(frameOf(label))).toEqual(focusRing)
    },
  )
})

const hovered = async (frame: Element) => {
  await userEvent.hover(frame)
  await settle()
  const color = borderOf(frame)
  await userEvent.unhover(frame)
  await settle()
  return color
}

/** Tab でフォーカスし、focus-ring の線と縁を返す。 */
const focused = async (frame: Element) => {
  await userEvent.tab()
  await settle()
  const style = getComputedStyle(frame)
  const ring = {
    outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
    halo: style.boxShadow,
  }
  ;(document.activeElement as HTMLElement | null)?.blur()
  return ring
}
