import { createFileRoute } from '@tanstack/react-router'

import { StaffCreateDialogContainer } from '#/features/staff/components/StaffCreateDialogContainer'

export const Route = createFileRoute('/staff/new')({
  head: () => ({ meta: [{ title: '職員の登録 | buddy' }] }),
  component: StaffCreateDialogContainer,
})
