import { queryOptions } from '@tanstack/react-query'

import { getViewerFn } from './bff/serverFns'
import type { ApiMode } from './createBuddyApi'
import { loadFake } from './loadFake'
import type { Viewer } from './types'

/**
 * ログインした職員を取る query。ログインしていなければ null になる。ログアウトは画面を読み直すので、取り直さない。
 * fake のダミーの職員は、bff のビルドに入れないために、読むときに読み込む。
 */
export const viewerQueryOptions = (mode: ApiMode) =>
  queryOptions<Viewer | null>({
    queryKey: ['viewer'],
    queryFn: async () => (mode === 'fake' ? (await loadFake()).FAKE_VIEWER : getViewerFn()),
    staleTime: Number.POSITIVE_INFINITY,
  })

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
