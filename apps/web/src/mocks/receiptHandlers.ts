import { createOpenApiHttp } from 'openapi-msw'

import type { paths } from '#/api/generated/receipt'

import { mockReceiptReport } from './receiptData'
import { withAuth } from './withAuth'

/** 照合の API（baseUrl）のフェイクの handler を作る。照合は入力によらず決まった結果を返す。 */
export const createReceiptHandlers = (baseUrl: string) => {
  const http = createOpenApiHttp<paths>({ baseUrl })
  return [
    http.post(
      '/v1/checks',
      withAuth(({ response }) => response(200).json(mockReceiptReport)),
    ),
  ]
}
