import { createFileRoute } from '@tanstack/react-router'

import { ScheduleEditModalContainer } from '#/features/schedule/components/ScheduleEditModalContainer'

export const Route = createFileRoute('/schedule/$scheduleId/edit')({
  component: ScheduleEditPage,
})

function ScheduleEditPage() {
  const { scheduleId } = Route.useParams()
  return <ScheduleEditModalContainer scheduleId={scheduleId} />
}
