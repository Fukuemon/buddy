import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { ScheduleDetailModalContainer } from '#/features/schedule/components/ScheduleDetailModalContainer'

export const Route = createFileRoute('/schedule/$scheduleId/')({
  beforeLoad: requirePermission('none'),
  component: ScheduleDetailPage,
})

function ScheduleDetailPage() {
  const { scheduleId } = Route.useParams()
  return <ScheduleDetailModalContainer scheduleId={scheduleId} />
}
