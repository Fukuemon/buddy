/** 待つ時間（ミリ秒）。内側から expect < 操作 < 外部の読み込み < テストの全体の順に長くする。 */
export const TIMEOUTS = {
  expect: 5_000,
  action: 10_000,
  navigation: 15_000,
  test: 60_000,
  /**
   * 止めた職員の画面がログインの画面へ戻るまで。web は access token（5 分）の期限の 1 分前に取り直し、
   * ブローカーが拒んだときにセッションを消すので、ログインから 4 分を少し過ぎるまでかかる
   */
  suspension: 300_000,
  /** エビデンスの spec の 1 本。字幕ごとに止め、撮った後に mp4 へ変換するので、E2E の 1 本より長い */
  evidence: 180_000,
}

/** 止めた職員がログインの画面へ戻るまで開き直す toPass に渡す。 */
export const SUSPENSION_WAIT = { timeout: TIMEOUTS.suspension }

/** 止めた職員がログインの画面へ戻るのを待つ spec の describe.configure に渡す。待つ間とログインの手順を足す。 */
export const SUSPENSION_TEST = { timeout: TIMEOUTS.suspension + TIMEOUTS.test }
