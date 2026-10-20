import { createMiddleware, createStart } from '@tanstack/react-start'

import { isCrossSiteWrite } from './server/sameOrigin'

const rejectCrossSiteWrite = createMiddleware({ type: 'request' }).server(({ request, next }) =>
  isCrossSiteWrite(request)
    ? Response.json(
        { code: 'forbidden', message: 'ほかのサイトからの操作は受けません' },
        { status: 403 },
      )
    : next(),
)

export const startInstance = createStart(() => ({ requestMiddleware: [rejectCrossSiteWrite] }))
