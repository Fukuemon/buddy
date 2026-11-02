import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { loginHref, viewerQueryOptions } from '#/api/viewer'
import { PageErrorMessage } from '#/components/page/PageErrorMessage'
import { SiteHeader } from '#/components/layout/SiteHeader'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { AppRouterContext } from '../integrations/tanstack-query/root-provider'

export const Route = createRootRouteWithContext<AppRouterContext>()({
  // /auth/ の下はログインの前と失敗の画面なので、職員を求めない
  beforeLoad: async ({ context, location }) => {
    if (location.pathname.startsWith('/auth/')) return { viewer: null }
    const viewer = await context.queryClient.ensureQueryData(viewerQueryOptions(context.mode))
    if (viewer === null) throw redirect({ href: loginHref(location.href), reloadDocument: true })
    return { viewer }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'buddy',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: RootError,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

function RootError() {
  const href = useRouterState({ select: (state) => state.location.href })
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <main className="grow">
        <PageErrorMessage reloadHref={href} />
      </main>
    </div>
  )
}
