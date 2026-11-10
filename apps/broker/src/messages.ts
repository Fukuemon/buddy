/** 画面の見出しと本文。 */
export type AuthMessage = { title: string; body: string }

/**
 * ブローカー、Hydra、予定の API の障害でログインを続けられないときの文言。
 * ID ブローカーのログインの失敗の画面（5xx）と、web のログインの失敗の画面（理由が failed）が出す。
 * 時間をおいて試すよう伝えるのは、この文言だけにする。
 */
export const loginFailedMessage: AuthMessage = {
  title: 'ログインできませんでした',
  body: '時間をおいて、もう一度ログインしてください。',
}

/**
 * ログインの試行の回数の上限を超えたときの文言。
 * ID ブローカーのログインの失敗の画面（429）と、web のログインの失敗の画面（理由が too_many_attempts）が出す。
 */
export const tooManyAttemptsMessage: AuthMessage = {
  title: 'しばらくログインできません',
  body: '続けて何度もログインを試したため、受け付けを止めています。30 秒ほどおいてから、もう一度ログインしてください。',
}

/**
 * ログインを始めた画面から続けられないときの文言。ID ブローカーのログインの失敗の画面（429 を除く 4xx）が出す。
 * この画面にはもう一度ログインするリンクが無いので、buddy を開き直すよう伝える。
 */
export const loginInterruptedMessage: AuthMessage = {
  title: 'ログインを続けられませんでした',
  body: 'もう一度 buddy を開いて、ログインしてください。',
}

/** ログアウトの失敗の文言。ID ブローカーだけが出す。 */
export const logoutFailedMessage: AuthMessage = {
  title: 'ログアウトできませんでした',
  body: '時間をおいて、もう一度 buddy を開いてログアウトしてください。',
}
