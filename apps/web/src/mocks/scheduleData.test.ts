import { describe, expect, it } from 'vite-plus/test'

import { SERVICE_CODES } from '#/api/types'

import { mockServiceCodes } from './scheduleData'

describe('scheduleData', () => {
  it('ダミーのサービスコードは、画面のサービスコードの一覧と同じ表記と並びである', () => {
    expect(mockServiceCodes.map((c) => c.code)).toEqual([...SERVICE_CODES])
  })
})
