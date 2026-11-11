import { isSessionUnavailable } from '#/api/sessionUnavailable'

import { PageErrorMessage } from './PageErrorMessage'
import { PageUnavailableMessage } from './PageUnavailableMessage'

export type PageFailureMessageProps = {
  /** 画面を描けなかった原因。route の errorComponent が受けたもの。 */
  error: unknown
  /** 読み直しのリンクの先。今の画面の URL を渡す。 */
  reloadHref: string
}

/**
 * 画面を描けなかったときの案内を、原因で選ぶ。ログインの期限を延ばせなかったときは一時的に使えない表示を、
 * それ以外は画面を表示できない表示を出す。サーバーの描画を越えたエラーはクラスが残らないので、文で見分ける。
 */
export const PageFailureMessage = ({ error, reloadHref }: PageFailureMessageProps) =>
  isSessionUnavailable(error) ? (
    <PageUnavailableMessage reloadHref={reloadHref} />
  ) : (
    <PageErrorMessage reloadHref={reloadHref} />
  )
