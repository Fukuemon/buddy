// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test'

import { fakeReceiptReport } from '../fake/fakeReceiptApi'
import { createBffReceiptApi } from './bffReceiptApi'

describe('createBffReceiptApi', () => {
  it('入力を FormData にして渡し、失敗を status と行のエラーつきの ApiError にする', async () => {
    const forms: FormData[] = []
    const csvErrors = [
      { source: 'visits' as const, reason: 'empty_value' as const, line: 2, message: 'x' },
    ]
    let ok = true
    const api = createBffReceiptApi(async (form) => {
      forms.push(form)
      return ok
        ? { ok: true, report: fakeReceiptReport }
        : { ok: false, status: 422, message: 'm', csvErrors }
    })
    await expect(api.check({ visits: new Blob(['v']), month: '2024-04' })).resolves.toEqual(
      fakeReceiptReport,
    )
    expect(forms[0].get('month')).toBe('2024-04')
    expect(forms[0].has('schedules')).toBe(false)

    ok = false
    await expect(
      api.check({ visits: new Blob(['v']), schedules: new Blob(['s']) }),
    ).rejects.toMatchObject({ status: 422, message: 'm', csvErrors })
    expect(forms[1].get('schedules')).toBeInstanceOf(Blob)
  })
})
