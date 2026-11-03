import { createFileRoute } from '@tanstack/react-router'

import { requirePermission, STAFF_MANAGE } from '#/api/permissions'
import { StaffCreateDialogContainer } from '#/features/staff/components/StaffCreateDialogContainer'

export const Route = createFileRoute('/staff/new')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  head: () => ({ meta: [{ title: '職員の登録 | buddy' }] }),
  component: StaffCreateDialogContainer,
})
