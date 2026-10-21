import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '#/api/client'

import { checkErrorMessage } from './errorMessage'

describe('checkErrorMessage', () => {
  it('status ごとに職員が次にすることの分かる文にする', () => {
    const row = [{ source: 'visits' as const, line: 3, message: 'x' }]
    expect(checkErrorMessage(new ApiError(400, 'ファイルのフィールド visits がない'))).toContain(
      '選び直して',
    )
    expect(checkErrorMessage(new ApiError(403, 'x'))).toContain('事業所が結び付いていない')
    expect(checkErrorMessage(new ApiError(413, 'x'))).toContain('10 MB')
    expect(checkErrorMessage(new ApiError(422, 'x', row))).toContain('次の行を直して')
    expect(checkErrorMessage(new ApiError(422, '列がない: 訪問日'))).toBe(
      '入力の CSV に誤りがあります。列がない: 訪問日',
    )
    expect(checkErrorMessage(new ApiError(502, 'x'))).toContain(
      'Google カレンダーから予定を取れません',
    )
    expect(checkErrorMessage(new ApiError(503, 'x'))).toContain('予定の CSV で照合')
    expect(checkErrorMessage(new ApiError(500, 'x'))).toContain('時間をおいて')
    expect(checkErrorMessage(new TypeError('Failed to fetch'))).toContain('時間をおいて')
  })
})
