import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './PageLead.stories'

const { Default } = composeStories(stories)

describe('PageLead', () => {
  it('続きの説明を閉じた状態で始め、「詳しく」で開閉する', async () => {
    render(<Default />)
    const toggle = screen.getByRole('button', { name: '詳しく' })
    const more = screen.getByTestId('page-lead-more')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(more).not.toBeVisible()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(more).toBeVisible()
    expect(more.textContent).toContain('4 つに分けます')

    await userEvent.click(toggle)
    expect(more).not.toBeVisible()
  })
})
