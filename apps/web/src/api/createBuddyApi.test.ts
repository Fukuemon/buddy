import { describe, expect, it } from 'vite-plus/test'

import { createBuddyApi } from './createBuddyApi'
import { FAKE_FACILITY_ID } from './fake/fixtures'

describe('createBuddyApi', () => {
  it('未指定なら偽物の API と架空の事業所を使う', () => {
    expect(createBuddyApi({}).facilityId).toBe(FAKE_FACILITY_ID)
  })

  it('http なら環境変数の事業所を使う', () => {
    expect(
      createBuddyApi({ VITE_API_MODE: 'http', VITE_FACILITY_ID: 'facility-1' }).facilityId,
    ).toBe('facility-1')
  })

  it('http で事業所がないとき、知らない値のときは Error を投げる', () => {
    expect(() => createBuddyApi({ VITE_API_MODE: 'http' })).toThrow('VITE_FACILITY_ID')
    expect(() => createBuddyApi({ VITE_API_MODE: 'real' })).toThrow('real')
  })
})
