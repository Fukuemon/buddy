import { describe, expect, it } from 'vite-plus/test'

import { loginFailedMessage } from './messages'
import { renderPages } from './pages'

describe('renderPages', () => {
  const pages = renderPages()

  it('3 つの画面を書き出し、どれも CSS を ID ブローカーが埋める式で持つこと', () => {
    expect(Object.keys(pages).sort()).toEqual(['failure.html', 'login.html', 'logout-failure.html'])
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

  it('ログインの失敗の画面は、web と同じ定数の文言を出すこと', () => {
    expect(pages['failure.html']).toContain(loginFailedMessage.title)
    expect(pages['failure.html']).toContain(loginFailedMessage.body)
  })
})
