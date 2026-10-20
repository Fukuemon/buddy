import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { ScheduleCreateModalContainer } from '#/features/schedule/components/ScheduleCreateModalContainer'
import {
  scheduleCreateSearchDefaults,
  scheduleCreateSearchSchema,
} from '#/features/schedule/schema/scheduleCreateSearch'

export const Route = createFileRoute('/schedule/new')({
  validateSearch: scheduleCreateSearchSchema,
  search: { middlewares: [stripSearchParams(scheduleCreateSearchDefaults)] },
  component: ScheduleCreateModalContainer,
})
