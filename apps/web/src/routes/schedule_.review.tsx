import { createFileRoute } from '@tanstack/react-router'

import { SiteLayoutContainer } from '#/components/site/SiteLayoutContainer'
import { REVIEW_NAV_ITEM } from '#/components/site/SiteNav'
import { CalendarReviewContainer } from '#/features/calendar/components/CalendarReviewContainer'

// `/schedule` の子にすると予定のカレンダーの上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/schedule_/review')({
  // フェイクの API はデータをブラウザのメモリに持つため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '確認が必要な予定 | buddy' }] }),
  component: CalendarReviewPage,
})

function CalendarReviewPage() {
  return (
    <SiteLayoutContainer current={REVIEW_NAV_ITEM.href}>
      <main className="min-w-0 p-4 desktop:p-6">
        <CalendarReviewContainer />
      </main>
    </SiteLayoutContainer>
  )
}
