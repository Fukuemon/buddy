import { useSyncExternalStore } from 'react'

/** tokens/theme.css の `--breakpoint-desktop` と同じ幅。Tailwind の `desktop:` が当たる範囲である。 */
const DESKTOP_MEDIA_QUERY = '(min-width: 48rem)'

const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

const subscribe = (onChange: () => void) => {
  if (!hasMatchMedia()) return () => {}
  const query = window.matchMedia(DESKTOP_MEDIA_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * 今の表示の幅が Tailwind の `desktop:` の範囲（768px 以上）かを返す。幅が変わっても知らせない。
 * サーバーと、matchMedia の無い環境（jsdom）では true を返す。
 */
export const isDesktopWidth = () =>
  !hasMatchMedia() || window.matchMedia(DESKTOP_MEDIA_QUERY).matches

/**
 * 表示の幅が Tailwind の `desktop:` の範囲（768px 以上）かを返し、幅が境を越えると描き直す。
 * サーバーと、matchMedia の無い環境（jsdom）では true を返す。
 */
export const useIsDesktop = () => useSyncExternalStore(subscribe, isDesktopWidth, () => true)
