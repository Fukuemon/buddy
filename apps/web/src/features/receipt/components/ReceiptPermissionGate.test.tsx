import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ReceiptPermissionGate.stories'

const { Allowed, Forbidden } = composeStories(stories)

describe('ReceiptPermissionGate', () => {
  it('照合の権限を持つ職員には、中身を出す', async () => {
    render(<Allowed />)
    expect(await screen.findByRole('heading', { name: '照合' })).toBeInTheDocument()
    expect(screen.queryByTestId('page-forbidden')).not.toBeInTheDocument()
  })

  it('照合の権限を持たない職員には、中身を出さず、照合の権限が要ることを示す', async () => {
    render(<Forbidden />)
    expect(await screen.findByTestId('page-forbidden')).toHaveTextContent(
      '照合の権限を持つ職員だけが開けます',
    )
    expect(screen.queryByRole('heading', { name: '照合' })).not.toBeInTheDocument()
  })
})
