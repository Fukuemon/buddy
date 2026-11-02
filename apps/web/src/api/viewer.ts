import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouteContext, useRouter } from '@tanstack/react-router'

import { getViewerFn } from './bff/serverFns'
import type { ApiMode } from './createBuddyApi'
import { queryKeys } from './queryKeys'
import { FAKE_VIEWER } from './fake/fixtures'
import type { Viewer } from './types'

/** Viewer を古いとみなすまでの時間。ほかの職員が権限を変えたときに、取り直すまでの長さの下限になる（ADR-0025）。 */
export const VIEWER_STALE_TIME_MS = 5 * 60 * 1000

/**
 * ログインした職員を取る query。ログインしていなければ null になる。
 * 古くなった後は、ウィンドウにフォーカスが戻ったときと、画面を移ったときに取り直す。
 * ログアウトは画面を読み直すので、ログアウトでは取り直さない。
 */
export const viewerQueryOptions = (mode: ApiMode) =>
  queryOptions<Viewer | null>({
    queryKey: queryKeys.viewer(),
    queryFn: () => (mode === 'fake' ? FAKE_VIEWER : getViewerFn()),
    staleTime: VIEWER_STALE_TIME_MS,
  })

/**
 * ログインした職員を query から読む。query の cache が空なら、root の route の beforeLoad が context に入れた値を使う。
 * 古くなった後にウィンドウにフォーカスが戻ると取り直し、権限の出し分けが変わる。
 */
export const useViewer = (): Viewer | null => {
  const { mode, viewer } = useRouteContext({ from: '__root__' })
  return useQuery({ ...viewerQueryOptions(mode), initialData: viewer }).data
}

/** ログインの画面へ移る URL。ログインの後に returnTo へ戻る。 */
export const loginHref = (returnTo: string) =>
  `/auth/login?returnTo=${encodeURIComponent(returnTo)}`

/**
 * 今の画面に戻るログインへ移り、終わらない Promise を返す。
 * 画面が移るまでの間に、呼び出し元がエラーの表示を出さないためである。ブラウザでだけ呼ぶ。
 */
export const redirectToLogin = (): Promise<never> => {
  window.location.assign(loginHref(window.location.pathname + window.location.search))
  return new Promise<never>(() => {})
}

/**
 * Viewer の query を取り直し、route の権限の確認をやり直す関数を返す。
 * 職員の権限、役職、チームを変えた後に呼ぶ。対象が自分かを見分けずに呼び、自分を変えたときの取り直し漏れを無くす（ADR-0025）。
 */
export const useRefreshViewer = () => {
  const queryClient = useQueryClient()
  const router = useRouter()
  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.viewer() })
    await router.invalidate()
  }
}
