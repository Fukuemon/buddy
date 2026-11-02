import createClient from 'openapi-fetch'

import { ApiError, type ReceiptApi } from '../BuddyApi'
import type { paths } from '../generated/receipt'
import type { HttpApiOptions } from './httpBuddyApi'

/** 照合の API を openapi-fetch で呼ぶ ReceiptApi を作る。トークンは fetch の側で付ける。 */
export const createReceiptApi = ({ baseUrl, fetch }: HttpApiOptions): ReceiptApi => {
  const client = createClient<paths>({ baseUrl, fetch })
  return {
    check: async (input) => {
      const { data, error, response } = await client.POST('/v1/checks', {
        body: input,
        bodySerializer: (body) => {
          const form = new FormData()
          form.append('visits', body.visits, 'visits.csv')
          if (body.schedules !== undefined)
            form.append('schedules', body.schedules, 'schedules.csv')
          if (body.month !== undefined) form.append('month', body.month)
          return form
        },
      })
      if (data !== undefined) return data
      throw new ApiError(
        response.status,
        error?.message ?? response.statusText,
        error?.errors ?? [],
        error?.code,
      )
    },
  }
}
