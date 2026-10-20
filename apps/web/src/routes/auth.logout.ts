import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { logout } = await import('#/server/auth')
        const { getAuthDeps } = await import('#/server/runtime')
        return logout(request, await getAuthDeps())
      },
    },
  },
})
