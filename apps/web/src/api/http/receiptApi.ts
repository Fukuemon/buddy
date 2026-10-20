import createClient from 'openapi-fetch'

import type { components, paths } from '../generated/receipt'
import { type HttpApiOptions, unwrap } from './httpBuddyApi'

export type ReceiptReport = components['schemas']['Report']
export type ReceiptCheckInput =
  paths['/v1/checks']['post']['requestBody']['content']['multipart/form-data']

/** 照合の API の操作。 */
export type ReceiptApi = {
  /**
   * 実訪問の CSV と予定を照合する。予定は schedules（予定の CSV）か month（Google カレンダーの対象の月）で渡す。
   *
   * API が失敗の状態を返すと ApiError を投げる。入力の CSV の行の誤りは status が 422 になる。
   */
  check(input: ReceiptCheckInput): Promise<ReceiptReport>
}

/** 照合の API を openapi-fetch で呼ぶ ReceiptApi を作る。トークンは付けない。 */
export const createReceiptApi = ({ baseUrl, fetch }: HttpApiOptions): ReceiptApi => {
  const client = createClient<paths>({ baseUrl, fetch })
  return {
    check: (input) =>
      unwrap(
        client.POST('/v1/checks', {
          body: input,
          bodySerializer: (body) => {
            const form = new FormData()
            form.append('visits', body.visits, 'visits.csv')
            if (body.schedules !== undefined)
              form.append('schedules', body.schedules, 'schedules.csv')
            if (body.month !== undefined) form.append('month', body.month)
            return form
          },
        }),
      ),
  }
}
