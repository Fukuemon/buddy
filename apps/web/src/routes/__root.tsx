import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
  type ErrorComponentProps,
  useMatches,
  useRouterState,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { SCREEN_PERMISSION_NAMES, deniedPermissionOf } from '#/api/permissions'
import { loginHref, useRecheckPermissionsOnViewerChange, viewerQueryOptions } from '#/api/viewer'
import { SiteHeader } from '#/components/layout/SiteHeader'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { siteNavHrefOf } from '#/components/layout/SiteNav'
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
    const viewer = await context.queryClient.fetchQuery(viewerQueryOptions(context.getViewer))
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
  component: RootLayout,
  errorComponent: RootError,
})

function RootDocument({ children }: { children: ReactNode }) {
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

/**
 * ログインした職員の画面の枠。ヘッダー、ナビゲーション、照合待ちのバッジで包み、中身を余白を付けた main に置く。
 * ナビゲーションの今の画面は、pathname から siteNavHrefOf で決める。
 */
function SiteFrame({ pathname, children }: { pathname: string; children: ReactNode }) {
  return (
    <SiteLayoutContainer
      current={siteNavHrefOf(pathname)}
      reviewBadge={<CalendarReviewBadgeContainer />}
    >
      <main className="min-w-0 p-4 desktop:p-6">{children}</main>
    </SiteLayoutContainer>
  )
}

/**
 * 画面の route を SiteFrame で包む。`/auth/` の下と、staticData の ownsSiteLayout が true の route とその子は包まない。
 * pathname は描いている matches から読み、遷移の途中でも、枠の出し分けと中身の route をそろえる。
 */
function RootLayout() {
  const pathname = useMatches({ select: (matches) => matches.at(-1)?.pathname ?? '/' })
  const ownsSiteLayout = useMatches({
    select: (matches) => matches.some((match) => match.staticData.ownsSiteLayout === true),
  })
  if (pathname.startsWith('/auth/') || ownsSiteLayout) return <Outlet />
  return (
    <SiteFrame pathname={pathname}>
      <Outlet />
    </SiteFrame>
  )
}

function RootError({ error }: ErrorComponentProps) {
  const href = useRouterState({ select: (state) => state.location.href })
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const denied = deniedPermissionOf(error)
  // 権限が無いときは、URL を変えずに画面の枠の中で示す（ADR-0015）
  if (denied !== undefined)
    return (
      <SiteFrame pathname={pathname}>
        <PageForbiddenMessage policyName={SCREEN_PERMISSION_NAMES[denied]} />
      </SiteFrame>
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
