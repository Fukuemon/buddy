import { describe, expect, it } from 'vite-plus/test'

import { createBuddyApi } from './createBuddyApi'

describe('createBuddyApi', () => {
  it('未指定ならフェイクの API を使う', () => {
    expect(createBuddyApi({}).mode).toBe('fake')
  })

  it('bff なら BFF を通す', () => {
    expect(createBuddyApi({ VITE_API_MODE: 'bff' }).mode).toBe('bff')
  })

  it('知らない値のときは Error を投げる', () => {
    expect(() => createBuddyApi({ VITE_API_MODE: 'http' })).toThrow('http')
  })
})
