import { createFileRoute } from '@tanstack/react-router'

import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { CalendarLinkContainer } from '#/features/calendar/components/CalendarLinkContainer'

// `/schedule` の子にすると予定のカレンダーの上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/schedule_/link')({
  // フェイクの API はデータをブラウザのメモリに持つため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: 'カレンダーの連携 | buddy' }] }),
  component: CalendarLinkPage,
})

function CalendarLinkPage() {
  return (
    <SiteLayoutContainer current="/schedule/link" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <CalendarLinkContainer />
      </main>
    </SiteLayoutContainer>
  )
}
