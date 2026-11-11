import { createFileRoute } from '@tanstack/react-router'

import { requirePermission, STAFF_MANAGE } from '#/api/permissions'
import { CalendarCutoverContainer } from '#/features/calendar/components/CalendarCutoverContainer'

export const Route = createFileRoute('/schedule_/link_/cutover')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  // 移行を始めた時刻と最後の同期の時刻を職員のデバイスの時間帯で出すため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '予定の管理を buddy に移す | buddy' }] }),
  component: CalendarCutoverPage,
})

function CalendarCutoverPage() {
  return <CalendarCutoverContainer />
}
