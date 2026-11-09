import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { ScheduleCreateModalContainer } from '#/features/schedule/components/ScheduleCreateModalContainer'
import {
  scheduleCreateSearchDefaults,
  scheduleCreateSearchSchema,
} from '#/features/schedule/schema/scheduleCreateSearch'

export const Route = createFileRoute('/schedule/new')({
  beforeLoad: requirePermission('none'),
  validateSearch: scheduleCreateSearchSchema,
  search: { middlewares: [stripSearchParams(scheduleCreateSearchDefaults)] },
  component: ScheduleCreateModalContainer,
})
