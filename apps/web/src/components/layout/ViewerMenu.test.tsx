import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ViewerMenu.stories'

const { Default, WithoutLogout } = composeStories(stories)

describe('ViewerMenu', () => {
  it('メニューに、名前とログアウトの間に自分の情報の画面へのリンクを置く', () => {
    render(<Default />)
    const profile = screen.getByTestId('viewer-profile')
    expect(profile).toHaveAttribute('href', '/me')
    expect(profile).toHaveTextContent('自分の情報')
    expect(
      profile.compareDocumentPosition(screen.getByTestId('viewer-logout')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('ログアウトを出さないときも、自分の情報の画面へのリンクを出す', () => {
    render(<WithoutLogout />)
    expect(screen.getByTestId('viewer-profile')).toHaveAttribute('href', '/me')
    expect(screen.queryByTestId('viewer-logout')).toBeNull()
  })
})
