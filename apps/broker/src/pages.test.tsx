import { describe, expect, it } from 'vite-plus/test'

import {
  loginFailedMessage,
  loginInterruptedMessage,
  tooManyAttemptsMessage,
  type AuthMessage,
} from './messages'
import { renderPages } from './pages'

describe('renderPages', () => {
  const pages = renderPages()

  it('5 つの画面を書き出し、どれも CSS を ID ブローカーが埋める式で持つこと', () => {
    expect(Object.keys(pages).sort()).toEqual([
      'failure.html',
      'interrupted.html',
      'login.html',
      'logout-failure.html',
      'too-many-attempts.html',
    ])
    for (const html of Object.values(pages)) {
      expect(html.startsWith('<!doctype html>\n')).toBe(true)
      expect(html).toContain('<style>{{css}}</style>')
    }
  })

  it('ログインの画面は、login_challenge を ID ブローカーが埋める式のまま書き出すこと', () => {
    expect(pages['login.html']).toContain(
      '<input type="hidden" name="login_challenge" value="{{.Challenge}}"/>',
    )
  })

  it('ログインの画面は、メールの欄をラベルと補足の文に結び付けること', () => {
    const html = pages['login.html']
    const id = /<input id="([^"]+)"[^>]*type="email"/.exec(html)?.[1]
    expect(id).toBeDefined()
    expect(html).toContain(`<label class="text-label" for="${id}"`)
    expect(html).toContain(`aria-describedby="${id}-hint"`)
  })

  it.each<[string, AuthMessage]>([
    ['failure.html', loginFailedMessage],
    ['interrupted.html', loginInterruptedMessage],
    ['too-many-attempts.html', tooManyAttemptsMessage],
  ])('ログインの失敗の画面の %s は、その失敗の定数の文言を出すこと', (page, message) => {
    expect(pages[page]).toContain(message.title)
    expect(pages[page]).toContain(message.body)
  })
})
