import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { MAX_SERVER_FN_BODY_BYTES } from './api/bff/receiptCall'
import { exceedsBodyLimit } from './server/bodyLimit'
import { isSameHostOrigin } from './server/sameOrigin'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// 既定の CSRF の middleware は server function だけを守るので、/auth/logout の POST も守るよう全ての要求に当てる
const csrf = createCsrfMiddleware({
  filter: ({ request }) => !SAFE_METHODS.has(request.method),
  origin: (origin, { request }) => isSameHostOrigin(origin, request),
  // ヘルスチェックや curl のように、ブラウザでない要求は Origin も Sec-Fetch-Site も持たない
  allowRequestsWithoutOriginCheck: true,
  failureResponse: Response.json(
    { code: 'forbidden', message: 'ほかのサイトからの操作は受けません' },
    { status: 403 },
  ),
})

const limitBody = createMiddleware({ type: 'request' }).server(({ request, next }) =>
  !SAFE_METHODS.has(request.method) && exceedsBodyLimit(request, MAX_SERVER_FN_BODY_BYTES)
    ? Response.json({ code: 'payload_too_large', message: '本文が大きすぎます' }, { status: 413 })
    : next(),
)

export const startInstance = createStart(() => ({ requestMiddleware: [limitBody, csrf] }))
