/** 画面の見出しと本文。 */
export type AuthMessage = { title: string; body: string }

/**
 * ログインの失敗の文言。ID ブローカーのログインの失敗の画面と、web のログインの失敗の画面（理由が failed）が出す。
 * 登録されていないメールと、ID ブローカーの中の失敗を画面で区別させないため、2 つの画面は同じ文言にする（ADR-0027）。
 */
export const loginFailedMessage: AuthMessage = {
  title: 'ログインできませんでした',
  body: '時間をおいて、もう一度ログインしてください。',
}

/** ログアウトの失敗の文言。ID ブローカーだけが出す。 */
export const logoutFailedMessage: AuthMessage = {
  title: 'ログアウトできませんでした',
  body: '時間をおいて、もう一度 buddy を開いてログアウトしてください。',
}
