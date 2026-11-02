// @vitest-environment node
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vite-plus/test'

import { MAX_RECEIPT_UPLOAD_BYTES } from '#/api/BuddyApi'
import { parseReceiptForm } from '#/api/bff/receiptCall'
import { fakeReceiptReport } from '#/api/fake/fakeReceiptApi'
import { receiptHttp, server, TEST_RECEIPT_URL } from '#/test/server'

import type { AuthDeps } from './auth'
import { checkReceipt } from './receipt'
import { createMemorySessionStore } from './sessionStore'
import { signValue } from './signedValue'

const SECRET = 'x'.repeat(32)

const form = (fields: Record<string, Blob | string>) => {
  const f = new FormData()
  for (const [key, value] of Object.entries(fields)) f.append(key, value)
  return f
}

describe('parseReceiptForm', () => {
  const csv = new Blob(['a'])

  it('実績の CSV と、予定の CSV か対象の月の一方を受ける', () => {
    expect(parseReceiptForm(form({ visits: csv, month: '2024-04' }))).toBeInstanceOf(FormData)
    expect(parseReceiptForm(form({ visits: csv, schedules: csv }))).toBeInstanceOf(FormData)
  })

  it('形の違う入力を拒む', () => {
    expect(() => parseReceiptForm({ visits: 'x' })).toThrow('FormData')
    expect(() => parseReceiptForm(form({ month: '2024-04' }))).toThrow('visits')
    expect(() => parseReceiptForm(form({ visits: csv }))).toThrow('一方')
    expect(() => parseReceiptForm(form({ visits: csv, schedules: csv, month: '2024-04' }))).toThrow(
      '一方',
    )
    expect(() => parseReceiptForm(form({ visits: csv, month: '2024-13' }))).toThrow('YYYY-MM')
    const big = new Blob([new Uint8Array(MAX_RECEIPT_UPLOAD_BYTES + 1)])
    expect(() => parseReceiptForm(form({ visits: big, month: '2024-04' }))).toThrow('大きすぎ')
  })
})

describe('checkReceipt', () => {
  const setup = async () => {
    const store = createMemorySessionStore()
    await store.set(
      'session:id-1',
      { staffId: 's', staffName: 'n', facilityId: 'f', accessToken: 'access-1' },
      60,
    )
    const auth: AuthDeps = {
      store,
      secret: SECRET,
      secureCookie: false,
      oidc: {} as AuthDeps['oidc'],
      fetchMe: async () => ({ ok: false, reason: 'failed' }),
    }
    return auth
  }
  const request = (cookie?: string) =>
    new Request('http://web.test/_serverFn', cookie ? { headers: { Cookie: cookie } } : {})

  it('セッションの token を付けて照合の API に送り、結果を返す', async () => {
    server.use(
      receiptHttp.post('/v1/checks', async ({ request, response }) => {
        const sent = await request.formData()
        return request.headers.get('Authorization') === 'Bearer access-1' &&
          sent.get('month') === '2024-04'
          ? response(200).json(fakeReceiptReport)
          : response(400).json({ code: 'bad_request', message: 'token か月が違う' })
      }),
    )
    const result = await checkReceipt(
      request(`buddy_session=${signValue('id-1', SECRET)}`),
      form({ visits: new Blob(['v']), month: '2024-04' }),
      { auth: await setup(), receiptApiUrl: TEST_RECEIPT_URL },
    )
    expect(result).toEqual({ ok: true, report: fakeReceiptReport })
  })

  it('入力の CSV の誤りを csvErrors で返す', async () => {
    const errors = [
      { source: 'visits' as const, reason: 'empty_value' as const, line: 2, message: 'x' },
    ]
    server.use(
      receiptHttp.post('/v1/checks', ({ response }) =>
        response(422).json({ code: 'invalid_csv', message: 'm', errors }),
      ),
    )
    const failed = await checkReceipt(
      request(`buddy_session=${signValue('id-1', SECRET)}`),
      form({ visits: new Blob(['v']), schedules: new Blob(['s']) }),
      { auth: await setup(), receiptApiUrl: TEST_RECEIPT_URL },
    )
    expect(failed).toEqual({
      ok: false,
      status: 422,
      message: 'm',
      csvErrors: errors,
      code: 'invalid_csv',
    })
  })

  it('セッションが無ければ 401 を返し、API を呼ばない', async () => {
    server.use(
      http.all(`${TEST_RECEIPT_URL}/*`, () =>
        HttpResponse.json({ code: 'internal', message: '呼ばれてはいけない' }, { status: 500 }),
      ),
    )
    const anonymous = await checkReceipt(
      request(),
      form({ visits: new Blob(['v']), month: '2024-04' }),
      { auth: await setup(), receiptApiUrl: TEST_RECEIPT_URL },
    )
    expect(anonymous).toMatchObject({ ok: false, status: 401 })
  })
})
