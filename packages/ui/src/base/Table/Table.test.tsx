import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './Table.stories'

const { Default } = composeStories(stories)

describe('Table', () => {
  it('表、列の見出し、セルの役割をブラウザの描画の後も保つ', () => {
    render(<Default />)
    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    const header = screen.getByRole('columnheader', { name: '名前' })
    expect(header.tagName).toBe('TH')
    expect(header).toHaveAttribute('scope', 'col')
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(screen.getByRole('cell', { name: '青木 一郎' })).toBeInTheDocument()
    expect(getComputedStyle(table).display).toBe('table')
  })
})
