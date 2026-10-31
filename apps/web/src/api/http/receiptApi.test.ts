// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { receiptHttp, server, TEST_RECEIPT_URL } from '#/test/server'

import { createReceiptApi } from './receiptApi'

const api = () => createReceiptApi({ baseUrl: TEST_RECEIPT_URL })

describe('createReceiptApi', () => {
  it('CSV を multipart で送り、照合の結果を返す', async () => {
    const report = {
      summary: { mismatch: 0, schedule_only: 0, visit_only: 0, match: 0 },
      rows: [],
      warnings: [],
    }
    server.use(
      receiptHttp.post('/v1/checks', async ({ request, response }) => {
        const form = await request.formData()
        const valid =
          (await (form.get('visits') as File).text()) === 'visits' &&
          (await (form.get('schedules') as File).text()) === 'schedules' &&
          !form.has('month')
        return valid
          ? response(200).json(report)
          : response(400).json({ code: 'bad_request', message: 'multipart の中身が違う' })
      }),
    )
    await expect(
      api().check({ visits: new Blob(['visits']), schedules: new Blob(['schedules']) }),
    ).resolves.toEqual(report)
  })

  it('失敗の状態なら、エラーの message の ApiError を投げる', async () => {
    server.use(
      receiptHttp.post('/v1/checks', ({ response }) =>
        response(400).json({ code: 'missing_file', message: 'ない' }),
      ),
    )
    await expect(api().check({ visits: new Blob(['']), month: '2024-04' })).rejects.toMatchObject({
      status: 400,
      message: 'ない',
    })
  })

  it('入力の CSV の行のエラーを csvErrors で渡す', async () => {
    const errors = [
      {
        source: 'visits' as const,
        reason: 'invalid_date' as const,
        line: 3,
        column: '訪問日',
        message: '日付を読めない',
      },
    ]
    server.use(
      receiptHttp.post('/v1/checks', ({ response }) =>
        response(422).json({ code: 'invalid_csv', message: 'CSV に誤りがある', errors }),
      ),
    )
    await expect(
      api().check({ visits: new Blob(['']), schedules: new Blob(['']) }),
    ).rejects.toMatchObject({ status: 422, csvErrors: errors })
  })
})
