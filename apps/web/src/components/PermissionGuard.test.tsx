import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './PermissionGuard.stories'

const { Allowed, Denied } = composeStories(stories)

describe('PermissionGuard', () => {
  it('権限を持つ職員には、children を出す', async () => {
    render(<Allowed />)
    expect(await screen.findByRole('button', { name: '職員を登録' })).toBeInTheDocument()
    expect(screen.queryByText('職員の管理の権限がありません')).toBeNull()
  })

  it('権限を持たない職員には、children を出さずに fallback を出す', async () => {
    render(<Denied />)
    expect(await screen.findByText('職員の管理の権限がありません')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '職員を登録' })).toBeNull()
  })
})
