/**
 * ログインの仕組みの障害で、ログインの期限を延ばせなかったことを示すエラーの文。
 * サーバーの描画とブラウザの間でエラーを受け渡すとクラスが残らないので、文で見分ける（deniedPermissionOf と同じ）。
 */
const SESSION_UNAVAILABLE = 'session-unavailable'

/** BFF の呼び出しが、ログインの期限を延ばせずに失敗したときのエラーのコード。status は 503 にする。 */
export const SESSION_UNAVAILABLE_CODE = 'session_unavailable'

/** BFF の呼び出しが、ログインの期限を延ばせずに失敗したときの失敗の文。画面は、この文ではなくコードで表示を選ぶ。 */
export const SESSION_UNAVAILABLE_MESSAGE = 'ログインを一時的に確認できません'

/**
 * access token が切れていて、Hydra が refresh を拒む以外の理由で失敗したときに投げる。セッションは残す（ADR-0044）。
 * 画面は、一時的に使えないことを示す表示にし、取り直さない。
 */
export class SessionUnavailableError extends Error {
  constructor() {
    super(SESSION_UNAVAILABLE)
    this.name = 'SessionUnavailableError'
  }
}

/** エラーが、ログインの期限を延ばせなかったことを示すかを返す。 */
export const isSessionUnavailable = (error: unknown) =>
  error instanceof Error && error.message === SESSION_UNAVAILABLE
