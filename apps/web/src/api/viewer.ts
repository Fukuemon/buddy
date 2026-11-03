import {
  hashKey,
  queryOptions,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useRouteContext, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { getViewerFn } from './bff/serverFns'
import type { ApiMode } from './createBuddyApi'
import { loadFake } from './loadFake'
import { queryKeys } from './queryKeys'
import type { Viewer } from './types'

/** Viewer を古いとみなすまでの時間。ほかの職員が権限を変えたときに、取り直すまでの長さの下限になる（ADR-0025）。 */
export const VIEWER_STALE_TIME_MS = 5 * 60 * 1000

/**
 * ログインした職員を取る query。ログインしていなければ null になる。
 * 古くなった後は、ウィンドウにフォーカスが戻ったときと、画面を移ったときに取り直す。
 * ログアウトは画面を読み直すので、ログアウトでは取り直さない。
 * fake のダミーの職員は、bff のビルドに入れないために、読むときに読み込む。
 */
export const viewerQueryOptions = (mode: ApiMode) =>
  queryOptions<Viewer | null>({
    queryKey: queryKeys.viewer(),
    queryFn: async () => (mode === 'fake' ? (await loadFake()).FAKE_VIEWER : getViewerFn()),
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
 * Viewer の query を取り直す関数を返す。
 * 職員の権限、役職、チームを変えた後に呼ぶ。対象が自分かを見分けずに呼び、自分を変えたときの取り直しを欠かさない（ADR-0025）。
 * 権限が変われば、useRecheckPermissionsOnViewerChange が route の権限の確認をやり直す。
 */
export const useRefreshViewer = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.viewer() })
}

const permissionsOf = (viewer: Viewer | null | undefined) => viewer?.policyCodes.join(',')

/**
 * Viewer の query を取り直して権限の code の一覧が変わったときに、onChange を呼ぶ。購読をやめる関数を返す。
 * 取り直したきっかけ（操作の後、ウィンドウへのフォーカス、画面の移動）を問わない。
 */
export const watchViewerPermissions = (queryClient: QueryClient, onChange: () => void) => {
  const viewerHash = hashKey(queryKeys.viewer())
  let last = permissionsOf(queryClient.getQueryData<Viewer | null>(queryKeys.viewer()))
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    if (event.query.queryHash !== viewerHash) return
    const current = permissionsOf(event.query.state.data as Viewer | null | undefined)
    if (current === last) return
    last = current
    onChange()
  })
}

/**
 * Viewer の権限が変わったときに、route の beforeLoad の権限の確認をやり直す。root の route で 1 度だけ呼ぶ。
 * 権限を足された職員の権限が無い表示を消し、外された職員の開いている画面を権限が無い表示に替える（ADR-0025）。
 */
export const useRecheckPermissionsOnViewerChange = () => {
  const router = useRouter()
  useEffect(
    () =>
      watchViewerPermissions(router.options.context.queryClient, () => void router.invalidate()),
    [router],
  )
}
