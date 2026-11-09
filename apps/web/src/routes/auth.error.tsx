import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AuthErrorMessage } from '#/components/page/AuthErrorMessage'

const searchSchema = z.object({
  reason: z.enum(['failed', 'forbidden', 'too_many_attempts']).catch('failed'),
})

export const Route = createFileRoute('/auth/error')({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: 'ログインできません | buddy' }] }),
  component: AuthErrorPage,
})

function AuthErrorPage() {
  const { reason } = Route.useSearch()
  return (
    <main className="grid min-h-dvh place-items-center bg-surface-canvas p-4">
      {/* Hydra は失敗した職員のログインも覚えているので、メールの入力の画面から入り直させる */}
      <AuthErrorMessage reason={reason} loginHref="/auth/login?prompt=login" />
    </main>
  )
}
