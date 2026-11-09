import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { ScheduleRecurrenceModalContainer } from '#/features/schedule/components/ScheduleRecurrenceModalContainer'

export const Route = createFileRoute('/schedule/$scheduleId/recurrence')({
  beforeLoad: requirePermission('none'),
  component: ScheduleRecurrencePage,
})

function ScheduleRecurrencePage() {
  const { scheduleId } = Route.useParams()
  return <ScheduleRecurrenceModalContainer scheduleId={scheduleId} />
}
