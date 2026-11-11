import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'

import { SessionUnavailableError } from '#/api/sessionUnavailable'

import { PageFailureMessage } from './PageFailureMessage'

describe('PageFailureMessage', () => {
  it('ログインの期限を延ばせなかったときは、一時的に使えない表示を出す', () => {
    render(<PageFailureMessage error={new SessionUnavailableError()} reloadHref="/schedule" />)
    expect(screen.getByTestId('page-unavailable')).toBeInTheDocument()
  })

  it('サーバーの描画を越えて文だけが残ったエラーでも、一時的に使えない表示を出す', () => {
    const crossed = new Error(new SessionUnavailableError().message)
    render(<PageFailureMessage error={crossed} reloadHref="/schedule" />)
    expect(screen.getByTestId('page-unavailable')).toBeInTheDocument()
  })

  it('ほかの失敗では、画面を表示できない表示を出す', () => {
    render(<PageFailureMessage error={new Error('boom')} reloadHref="/schedule" />)
    expect(screen.getByTestId('page-error')).toBeInTheDocument()
    expect(screen.queryByTestId('page-unavailable')).not.toBeInTheDocument()
  })
})
