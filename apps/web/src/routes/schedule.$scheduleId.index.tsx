import { createFileRoute } from '@tanstack/react-router'

import { ScheduleDetailModalContainer } from '#/features/schedule/components/ScheduleDetailModalContainer'

export const Route = createFileRoute('/schedule/$scheduleId/')({
  component: ScheduleDetailPage,
})

function ScheduleDetailPage() {
  const { scheduleId } = Route.useParams()
  return <ScheduleDetailModalContainer scheduleId={scheduleId} />
}
