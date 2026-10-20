import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { startLogin } = await import('#/server/auth')
        const { getAuthDeps } = await import('#/server/runtime')
        return startLogin(request, await getAuthDeps())
      },
    },
  },
})
