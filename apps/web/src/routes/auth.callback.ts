import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishLogin } = await import('#/server/auth')
        const { getAuthDeps } = await import('#/server/runtime')
        return finishLogin(request, await getAuthDeps())
      },
    },
  },
})
