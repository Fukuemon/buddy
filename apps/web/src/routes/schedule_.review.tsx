import { createFileRoute } from '@tanstack/react-router'

import { SiteHeaderContainer } from '#/components/site/SiteHeaderContainer'
import { REVIEW_NAV_ITEM } from '#/components/site/SiteNav'
import { CalendarReviewContainer } from '#/features/calendar/components/CalendarReviewContainer'

// `/schedule` の子にすると予定のカレンダーの上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/schedule_/review')({
  // 偽物の API はデータをブラウザのメモリに持つため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '確かめが要る予定 | buddy' }] }),
  component: CalendarReviewPage,
})

function CalendarReviewPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeaderContainer current={REVIEW_NAV_ITEM.href} />
      <main className="min-w-0 p-4 desktop:p-6">
        <CalendarReviewContainer />
      </main>
    </div>
  )
}
