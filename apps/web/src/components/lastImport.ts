import type { ExternalCalendar } from '#/api/types'

const pad = (value: number) => String(value).padStart(2, '0')

/** `YYYY-MM-DD` を「2026/11/04」の形にする。 */
export const formatDate = (date: string) => date.replaceAll('-', '/')

/** 期間を「2026/11/01〜2026/11/30」の形にする。終わりの無い期間（切り替えの取り込み）は「2026/11/01〜」にする。 */
export const formatDateRange = (start: string, end: string | null | undefined) =>
  `${formatDate(start)}〜${end == null ? '' : formatDate(end)}`

/** オフセットつきの日時を、デバイスの時間帯で「2026/10/20 15:42」の形にする。 */
export const formatDateTime = (iso: string) => {
  const date = new Date(iso)
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * カレンダーの最後の取り込みを「2026/10/20 15:42（2026/10/01〜2026/10/31）」の形にする。取り込んだことが無ければ「なし」。
 * カレンダーの連携の画面と、自分の情報の画面が使う。
 */
export const formatLastImport = (run: ExternalCalendar['last_import']) => {
  if (run === null) return 'なし'
  const failed = run.status === 'failed' ? '（失敗）' : ''
  return `${formatDateTime(run.finished_at ?? run.started_at)}${failed}（${formatDateRange(run.range_start, run.range_end)}）`
}
