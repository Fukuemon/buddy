import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { parseBffCall } from './bffCall'

/** BuddyApi の操作を BFF で中継する。中身は src/server/bff.ts の callBff にある。 */
export const callBffFn = createServerFn({ method: 'POST' })
  .validator(parseBffCall)
  .handler(async ({ data }) => {
    const { callBff } = await import('#/server/bff')
    const { getAuthDeps, getRuntime } = await import('#/server/runtime')
    return callBff(getRequest(), data, {
      auth: await getAuthDeps(),
      scheduleApiUrl: getRuntime().config.scheduleApiUrl,
    })
  })

/** ログインした職員を返す。ログインしていなければ null を返す。 */
export const getViewerFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { readSession, viewerOf } = await import('#/server/auth')
  const { getAuthDeps } = await import('#/server/runtime')
  const session = await readSession(getRequest(), await getAuthDeps())
  return session === undefined ? null : viewerOf(session)
})
