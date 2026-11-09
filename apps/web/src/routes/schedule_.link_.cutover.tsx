import { createFileRoute } from '@tanstack/react-router'

import { requirePermission, STAFF_MANAGE } from '#/api/permissions'
import { CalendarCutoverContainer } from '#/features/calendar/components/CalendarCutoverContainer'

export const Route = createFileRoute('/schedule_/link_/cutover')({
  beforeLoad: requirePermission(STAFF_MANAGE),
  // 切り替えを始めた時刻と最後の同期の時刻を職員のデバイスの時間帯で出すため、サーバーで描画しない
  ssr: false,
  head: () => ({ meta: [{ title: '予定の正本の切り替え | buddy' }] }),
  component: CalendarCutoverPage,
})

function CalendarCutoverPage() {
  return <CalendarCutoverContainer />
}
