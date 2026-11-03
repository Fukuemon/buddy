import { createFileRoute } from '@tanstack/react-router'

import { requirePermission, STAFF_MANAGE } from '#/api/permissions'
import { PatientCreateDialogContainer } from '#/features/patient/components/PatientCreateDialogContainer'

export const Route = createFileRoute('/patients/new')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  head: () => ({ meta: [{ title: '利用者の登録 | buddy' }] }),
  component: PatientCreateDialogContainer,
})
