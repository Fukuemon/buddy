import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { PatientCreateDialogContainer } from '#/features/patient/components/PatientCreateDialogContainer'

export const Route = createFileRoute('/patients/new')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  head: () => ({ meta: [{ title: '利用者の登録 | buddy' }] }),
  component: PatientCreateDialogContainer,
})
