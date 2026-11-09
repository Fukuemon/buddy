import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './CalendarLinkView.stories'

const { List, NoLinks } = composeStories(stories)

describe('CalendarLinkView', () => {
  it('結び付けた職員がいれば、共有する相手のメールアドレスとコピーを出し、共有の手順は閉じておく', () => {
    render(<List />)
    expect(screen.getByTestId('calendar-link-service-account')).toBeVisible()
    expect(screen.getByTestId('calendar-link-copy')).toBeVisible()
    const toggle = screen.getByRole('button', { name: '詳しく' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', screen.getByTestId('calendar-link-steps').id)
    expect(screen.getByTestId('calendar-link-steps')).not.toBeVisible()
  })

  it('詳しくを押すと共有の手順を開き、もう一度押すと閉じる', async () => {
    render(<List />)
    const toggle = screen.getByRole('button', { name: '詳しく' })

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('calendar-link-steps')).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('calendar-link-steps')).not.toBeVisible()
  })

  it('どの職員も結び付けていなければ、共有の手順を開いた状態で始める', () => {
    render(<NoLinks />)
    expect(screen.getByRole('button', { name: '詳しく' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('calendar-link-steps')).toBeVisible()
  })
})
