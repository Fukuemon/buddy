import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/readyz')({
  server: {
    handlers: {
      // 偽物の API で動くときはセッションを持たないので、応答できれば要求を受けられる
      GET: async () => {
        if (import.meta.env.VITE_API_MODE !== 'bff') return Response.json({ status: 'ok' })
        const { getRuntime } = await import('#/server/runtime')
        try {
          await getRuntime().store.ping()
          return Response.json({ status: 'ok' })
        } catch {
          return Response.json({ status: 'unavailable' }, { status: 503 })
        }
      },
    },
  },
})
