import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './appContext'

/** router を作る。サーバーではリクエストごとに呼ばれ、リクエストの間で query の cache を共有しない。 */
export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
  interface StaticDataRouteOption {
    /**
     * true の route と、その子の route は、root の route の画面の枠（SiteLayoutContainer）で包まない。
     * 左の欄を持つ予定の画面のように、機能の Layout が自分で SiteLayoutContainer を使う route に付ける。
     */
    ownsSiteLayout?: boolean
  }
}
