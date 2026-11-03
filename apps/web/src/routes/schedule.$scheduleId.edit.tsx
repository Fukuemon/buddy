import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { ScheduleEditModalContainer } from '#/features/schedule/components/ScheduleEditModalContainer'

export const Route = createFileRoute('/schedule/$scheduleId/edit')({
  beforeLoad: requirePermission('none'),
  component: ScheduleEditPage,
})

function ScheduleEditPage() {
  const { scheduleId } = Route.useParams()
  return <ScheduleEditModalContainer scheduleId={scheduleId} />
}
