import { createFileRoute } from '@tanstack/react-router'

import { SiteLayoutContainer } from '#/components/site/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { OrganizationListContainer } from '#/features/organization/components/OrganizationListContainer'

export const Route = createFileRoute('/organization')({
  // フェイクの API はデータをブラウザのメモリに持つため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '部署とチーム | buddy' }] }),
  component: OrganizationPage,
})

function OrganizationPage() {
  return (
    <SiteLayoutContainer current="/organization" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <OrganizationListContainer />
      </main>
    </SiteLayoutContainer>
  )
}
