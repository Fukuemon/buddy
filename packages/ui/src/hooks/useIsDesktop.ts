import { useSyncExternalStore } from 'react'

/** tokens/theme.css の `--breakpoint-desktop` と同じ幅。Tailwind の `desktop:` が当たる範囲である。 */
const DESKTOP_MEDIA_QUERY = '(min-width: 48rem)'

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(DESKTOP_MEDIA_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** 表示の幅が Tailwind の `desktop:` の範囲（768px 以上）かを返し、幅が境を越えると描き直す。サーバーでは true を返す。 */
export const useIsDesktop = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_MEDIA_QUERY).matches,
    () => true,
  )
