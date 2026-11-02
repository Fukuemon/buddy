import { Outlet, createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { SiteLayoutContainer } from '#/components/layout/SiteLayoutContainer'
import { CalendarReviewBadgeContainer } from '#/features/calendar/components/CalendarReviewBadgeContainer'
import { PatientListContainer } from '#/features/patient/components/PatientListContainer'

export const Route = createFileRoute('/patients')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  // フェイクの API はデータをブラウザのメモリに持つため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '利用者 | buddy' }] }),
  component: PatientsPage,
})

function PatientsPage() {
  return (
    <SiteLayoutContainer current="/patients" reviewBadge={<CalendarReviewBadgeContainer />}>
      <main className="min-w-0 p-4 desktop:p-6">
        <PatientListContainer />
      </main>
      <Outlet />
    </SiteLayoutContainer>
  )
}
