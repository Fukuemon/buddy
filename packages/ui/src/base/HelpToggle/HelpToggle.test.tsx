import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { userEvent } from 'vite-plus/test/browser/context'

import * as stories from './HelpToggle.stories'

const { Default } = composeStories(stories)

const helpButton = () => screen.getByRole('button', { name: 'ヘルプ' })
const helpText = () => screen.getByTestId('review-help-text')

describe('HelpToggle', () => {
  it('押すと説明を開き、もう一度押すと閉じる。aria-expanded で開閉を伝える', async () => {
    render(<Default />)
    expect(helpButton()).toHaveAttribute('aria-expanded', 'false')
    expect(helpButton()).toHaveAttribute('aria-controls', helpText().id)
    expect(helpText()).not.toBeVisible()

    await userEvent.click(helpButton())
    expect(helpButton()).toHaveAttribute('aria-expanded', 'true')
    expect(helpText()).toBeVisible()

    await userEvent.click(helpButton())
    expect(helpButton()).toHaveAttribute('aria-expanded', 'false')
    expect(helpText()).not.toBeVisible()
  })

  it('Escape で閉じる', async () => {
    render(<Default />)
    await userEvent.click(helpButton())
    await userEvent.keyboard('{Escape}')
    expect(helpText()).not.toBeVisible()
  })

  it('説明の外を押すと閉じ、説明を押しても閉じない', async () => {
    render(<Default />)
    await userEvent.click(helpButton())
    await userEvent.click(helpText())
    expect(helpText()).toBeVisible()

    await userEvent.click(screen.getByRole('heading', { name: '確認が必要な予定' }))
    expect(helpText()).not.toBeVisible()
  })

  it('開くボタンは 44×44 px 以上を押せる', () => {
    render(<Default />)
    const rect = helpButton().getBoundingClientRect()
    expect(rect.width).toBeGreaterThanOrEqual(44)
    expect(rect.height).toBeGreaterThanOrEqual(44)
  })
})
