import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AuthErrorMessage } from '#/components/site/AuthErrorMessage'
import { SiteHeader } from '#/components/site/SiteHeader'

const searchSchema = z.object({
  reason: z.enum(['failed', 'forbidden']).catch('failed'),
})

export const Route = createFileRoute('/auth/error')({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: 'ログインできません | buddy' }] }),
  component: AuthErrorPage,
})

function AuthErrorPage() {
  const { reason } = Route.useSearch()
  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader />
      <main className="grow p-6">
        {/* Hydra は失敗した職員のログインも覚えているので、メールの入力の画面から入り直させる */}
        <AuthErrorMessage reason={reason} loginHref="/auth/login?prompt=login" />
      </main>
    </div>
  )
}
