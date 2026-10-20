// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { MAX_RECEIPT_UPLOAD_BYTES, parseReceiptForm } from '#/api/bff/receiptCall'
import { fakeReceiptReport } from '#/api/fake/fakeReceiptApi'

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

  it('形の誤りを拒む', () => {
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
    const auth = await setup()
    let sent: Request | undefined
    const result = await checkReceipt(
      request(`buddy_session=${signValue('id-1', SECRET)}`),
      form({ visits: new Blob(['v']), month: '2024-04' }),
      {
        auth,
        receiptApiUrl: 'http://receipt.test',
        fetch: async (input) => {
          sent = input as Request
          return Response.json(fakeReceiptReport)
        },
      },
    )
    expect(result).toEqual({ ok: true, report: fakeReceiptReport })
    expect(sent?.headers.get('Authorization')).toBe('Bearer access-1')
    expect((await sent?.formData())?.get('month')).toBe('2024-04')
  })

  it('行の誤りを rowErrors で返し、セッションが無ければ API を呼ばない', async () => {
    const auth = await setup()
    const errors = [{ source: 'visits', line: 2, message: 'x' }]
    const failed = await checkReceipt(
      request(`buddy_session=${signValue('id-1', SECRET)}`),
      form({ visits: new Blob(['v']), schedules: new Blob(['s']) }),
      {
        auth,
        receiptApiUrl: 'http://receipt.test',
        fetch: async () =>
          Response.json({ code: 'invalid_csv', message: 'm', errors }, { status: 422 }),
      },
    )
    expect(failed).toEqual({ ok: false, status: 422, message: 'm', rowErrors: errors })

    let called = false
    const anonymous = await checkReceipt(
      request(),
      form({ visits: new Blob(['v']), month: '2024-04' }),
      {
        auth,
        receiptApiUrl: 'http://receipt.test',
        fetch: async () => {
          called = true
          return Response.json({})
        },
      },
    )
    expect(anonymous).toMatchObject({ ok: false, status: 401 })
    expect(called).toBe(false)
  })
})
