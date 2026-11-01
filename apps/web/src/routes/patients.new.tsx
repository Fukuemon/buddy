import { createFileRoute } from '@tanstack/react-router'

import { PatientCreateDialogContainer } from '#/features/patient/components/PatientCreateDialogContainer'

export const Route = createFileRoute('/patients/new')({
  head: () => ({ meta: [{ title: '利用者の登録 | buddy' }] }),
  component: PatientCreateDialogContainer,
})
