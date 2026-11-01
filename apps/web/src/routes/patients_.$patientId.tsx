import { createFileRoute } from '@tanstack/react-router'

import { SiteLayoutContainer } from '#/components/site/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { PatientDetailContainer } from '#/features/patient/components/PatientDetailContainer'

// `/patients` の子にすると利用者の一覧の上に重なるので、名前の `_` で入れ子から外す
export const Route = createFileRoute('/patients_/$patientId')({
  // フェイクの API はデータをブラウザのメモリに持つため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '利用者の詳細 | buddy' }] }),
  component: PatientDetailPage,
})

function PatientDetailPage() {
  const { patientId } = Route.useParams()
  return (
    <SiteLayoutContainer current="/patients" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <PatientDetailContainer key={patientId} patientId={patientId} />
      </main>
    </SiteLayoutContainer>
  )
}
