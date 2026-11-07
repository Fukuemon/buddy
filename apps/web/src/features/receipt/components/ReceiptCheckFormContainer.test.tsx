import { composeStories } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import * as stories from './ReceiptCheckFormContainer.stories'

const { SlowCheckError } = composeStories(stories)

const csv = (name: string) => new File(['訪問日'], name, { type: 'text/csv' })

describe('ReceiptCheckFormContainer', () => {
  it('送っている途中に実績の CSV を選び直しても、照合するを押せないままにし、先の照合の失敗の文を出す', async () => {
    render(<SlowCheckError />)
    await userEvent.upload(await screen.findByTestId('receipt-visits-file'), csv('visits.csv'))
    const submit = screen.getByTestId('receipt-check-submit')
    await userEvent.click(submit)
    expect(submit).toHaveAttribute('aria-busy', 'true')

    await userEvent.upload(screen.getByTestId('receipt-visits-file'), csv('visits-2.csv'))
    expect(submit).toHaveAttribute('aria-busy', 'true')

    expect(await screen.findByTestId('receipt-check-error')).toHaveTextContent(
      '照合できませんでした。時間をおいて、もう一度照合してください。',
    )
    expect(submit).not.toHaveAttribute('aria-busy')
  })

  it('照合が失敗した後に入力を変えると、失敗の文を消す', async () => {
    render(<SlowCheckError />)
    await userEvent.upload(await screen.findByTestId('receipt-visits-file'), csv('visits.csv'))
    await userEvent.click(screen.getByTestId('receipt-check-submit'))
    await screen.findByTestId('receipt-check-error')

    await userEvent.upload(screen.getByTestId('receipt-visits-file'), csv('visits-2.csv'))
    expect(screen.queryByTestId('receipt-check-error')).toBeNull()
  })
})
