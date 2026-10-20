// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { createReceiptApi } from './receiptApi'

describe('createReceiptApi', () => {
  it('CSV を multipart で送り、照合の結果を返す', async () => {
    let form = new FormData()
    const report = {
      summary: { mismatch: 0, schedule_only: 0, visit_only: 0, match: 0 },
      rows: [],
      warnings: [],
    }
    const api = createReceiptApi({
      baseUrl: 'http://api.test',
      fetch: async (input) => {
        form = await (input as Request).formData()
        return new Response(JSON.stringify(report), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    await expect(
      api.check({ visits: new Blob(['visits']), schedules: new Blob(['schedules']) }),
    ).resolves.toEqual(report)
    expect(await (form.get('visits') as File).text()).toBe('visits')
    expect(await (form.get('schedules') as File).text()).toBe('schedules')
    expect(form.has('month')).toBe(false)
  })

  it('失敗の状態なら、エラーの message の ApiError を投げる', async () => {
    const api = createReceiptApi({
      baseUrl: 'http://api.test',
      fetch: async () =>
        new Response(JSON.stringify({ code: 'missing_file', message: 'ない' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
    })
    await expect(api.check({ visits: new Blob(['']), month: '2024-04' })).rejects.toMatchObject({
      status: 400,
      message: 'ない',
    })
  })

  it('入力の CSV の行の誤りを rowErrors で渡す', async () => {
    const errors = [{ source: 'visits', line: 3, column: '訪問日', message: '日付を読めない' }]
    const api = createReceiptApi({
      baseUrl: 'http://api.test',
      fetch: async () =>
        Response.json(
          { code: 'invalid_csv', message: 'CSV に誤りがある', errors },
          { status: 422 },
        ),
    })
    await expect(
      api.check({ visits: new Blob(['']), schedules: new Blob(['']) }),
    ).rejects.toMatchObject({ status: 422, rowErrors: errors })
  })
})
