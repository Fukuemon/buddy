import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  redirect,
  type ErrorComponentProps,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { SCREEN_PERMISSION_NAMES, deniedPermissionOf } from '#/api/permissions'
import { loginHref, useRecheckPermissionsOnViewerChange, viewerQueryOptions } from '#/api/viewer'
import { SiteHeader } from '#/components/layout/SiteHeader'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { PageErrorMessage } from '#/components/page/PageErrorMessage'
import { PageForbiddenMessage } from '#/components/page/PageForbiddenMessage'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { AppRouterContext } from '#/appContext'

export const Route = createRootRouteWithContext<AppRouterContext>()({
  // /auth/ の下はログインの前と失敗の画面なので、職員を求めない
  beforeLoad: async ({ context, location }) => {
    if (location.pathname.startsWith('/auth/')) return { viewer: null }
    const viewer = await context.queryClient.fetchQuery(viewerQueryOptions(context.mode))
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
  useRecheckPermissionsOnViewerChange()
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

function RootError({ error }: ErrorComponentProps) {
  const href = useRouterState({ select: (state) => state.location.href })
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const denied = deniedPermissionOf(error)
  // 権限が無いときは、URL を変えずに画面の枠の中で示す（ADR-0025）
  if (denied !== undefined)
    return (
      <SiteLayoutContainer current={pathname} reviewBadge={<CalendarReviewBadgeContainer />}>
        <main className="min-w-0 p-4 desktop:p-6">
          <PageForbiddenMessage policyName={SCREEN_PERMISSION_NAMES[denied]} />
        </main>
      </SiteLayoutContainer>
    )
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <main className="grow">
        <PageErrorMessage reloadHref={href} />
      </main>
    </div>
  )
}
