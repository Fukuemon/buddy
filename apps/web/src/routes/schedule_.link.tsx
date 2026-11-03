import { createFileRoute } from '@tanstack/react-router'

import { requirePermission } from '#/api/permissions'
import { STAFF_MANAGE } from '#/api/types'
import { CalendarLinkContainer } from '#/features/calendar/components/CalendarLinkContainer'

export const Route = createFileRoute('/schedule_/link')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  // 最後の取り込みの日時を職員のデバイスの時間帯で出すため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: 'カレンダーの連携 | buddy' }] }),
  component: CalendarLinkPage,
})

function CalendarLinkPage() {
  return <CalendarLinkContainer />
}
