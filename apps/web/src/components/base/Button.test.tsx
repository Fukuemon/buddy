import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fn } from 'storybook/test'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './Button.stories'

const { Primary, Loading } = composeStories(stories)

describe('Button', () => {
  it('押すと onClick を呼ぶ', async () => {
    const onClick = fn()
    render(<Primary onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('読み込み中は onClick を呼ばない', async () => {
    const onClick = fn()
    render(<Loading onClick={onClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})
