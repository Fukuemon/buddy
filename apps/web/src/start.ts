import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

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

export const startInstance = createStart(() => ({ requestMiddleware: [csrf] }))
