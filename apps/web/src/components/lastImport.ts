import type { ExternalCalendar } from '#/api/types'

import { formatDateKeyRange, formatDateTime } from './dateFormat'

/**
 * カレンダーの最後の取り込みを「2026年10月20日（火） 15:42（2026年10月1日（木）〜2026年10月31日（土））」の形にする。
 * 日時はデバイスの時間帯で出す。取り込んだことが無ければ「なし」。カレンダーの連携の画面と、自分の情報の画面が使う。
 */
export const formatLastImport = (run: ExternalCalendar['last_import']) => {
  if (run === null) return 'なし'
  const failed = run.status === 'failed' ? '（失敗）' : ''
  return `${formatDateTime(new Date(run.finished_at ?? run.started_at))}${failed}（${formatDateKeyRange(run.range_start, run.range_end)}）`
}
