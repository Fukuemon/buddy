import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '#/api/BuddyApi'

import { shouldRetryQuery } from './appContext'

describe('shouldRetryQuery', () => {
  it('4xx は取り直さない', () => {
    for (const status of [400, 403, 404]) {
      expect(shouldRetryQuery(0, new ApiError(status, 'client error'))).toBe(false)
    }
  })

  it('5xx と API に届かない失敗は、3 回まで取り直す', () => {
    expect(shouldRetryQuery(0, new ApiError(500, 'internal'))).toBe(true)
    expect(shouldRetryQuery(2, new TypeError('Failed to fetch'))).toBe(true)
    expect(shouldRetryQuery(3, new ApiError(503, 'unavailable'))).toBe(false)
  })
})
