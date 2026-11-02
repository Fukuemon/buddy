/**
 * route の loader で、画面が読む query の prefetch の終わりを、サーバーで描画するときだけ待つ。
 *
 * サーバーでは、読み終えたデータを描画した HTML に入れ、ブラウザの query の cache に渡す。
 * ブラウザでは待たずに画面を移し、Container が読み込み中の表示を出す。
 * prefetch は失敗しても reject しないので、失敗した query は Container が取り直し、失敗の表示を出す。
 */
export const awaitOnServer = async (prefetches: readonly Promise<void>[]) => {
  if (import.meta.env.SSR) await Promise.all(prefetches)
}
