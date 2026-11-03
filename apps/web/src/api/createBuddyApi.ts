import { createBffBuddyApi } from './bff/bffBuddyApi'
import { createBffReceiptApi } from './bff/bffReceiptApi'
import { getViewerFn } from './bff/serverFns'
import type { BuddyApi, ReceiptApi } from './BuddyApi'
import { createDeferredFakeApis, loadFake } from './loadFake'
import type { Viewer } from './types'

/** createBuddyApi が読む環境変数。意味は README の Configuration にある。 */
export type ApiEnv = {
  VITE_API_MODE?: string
}

/** fake はローカルのフェイクの API、bff はサーバーのセッションで予定の API を呼ぶ。 */
export type ApiMode = 'fake' | 'bff'

/**
 * データを読む画面を、サーバーで描画するか。route の `ssr` に渡す。
 *
 * fake は、データをブラウザとサーバーのそれぞれのメモリに別々に持つ。
 * サーバーで描画すると、ブラウザで作った予定が、サーバーが描画した画面に無いことになるので、ブラウザでだけ描画する。
 */
export const RENDER_DATA_ON_SERVER = import.meta.env.VITE_API_MODE === 'bff'

/**
 * VITE_API_MODE が bff なら BFF を通す BuddyApi と ReceiptApi を、fake か未指定ならフェイクを作る。
 * ログインした職員を読む getViewer も、同じモードで作る。
 * フェイクの実装とダミーの職員は、初めて呼んだときに読み込む。
 *
 * VITE_API_MODE がほかの値のときは Error を投げる。
 */
export const createBuddyApi = (
  env: ApiEnv,
): {
  api: BuddyApi
  receiptApi: ReceiptApi
  mode: ApiMode
  getViewer: () => Promise<Viewer | null>
} => {
  const mode = env.VITE_API_MODE || 'fake'
  if (mode === 'fake')
    return {
      ...createDeferredFakeApis(),
      mode,
      getViewer: async () => (await loadFake()).FAKE_VIEWER,
    }
  if (mode === 'bff')
    return {
      api: createBffBuddyApi(),
      receiptApi: createBffReceiptApi(),
      mode,
      getViewer: () => getViewerFn(),
    }
  throw new Error(`VITE_API_MODE は fake か bff にする: ${mode}`)
}
