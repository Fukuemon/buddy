/** 待つ時間（ミリ秒）。内側から expect < 操作 < 外部の読み込み < テストの全体の順に長くする。 */
export const TIMEOUT_MS = {
  expect: 5_000,
  action: 10_000,
  navigation: 15_000,
  test: 60_000,
  /**
   * 止めた職員の画面がログインの画面へ戻るまで。web は access token（5 分）の期限の 1 分前に取り直し、
   * ブローカーが拒んだときにセッションを消すので、ログインから 4 分を少し過ぎるまでかかる
   */
  suspension: 300_000,
  /**
   * ログインの仕組みの故障の中で、web が refresh の失敗の画面を出すまで。改修前の web は 1 回の表示で refresh を 4 回試し、
   * ブローカーが答えないときに約 27 秒かかった（docs/verification/877-token-hook-failures/README.md）
   */
  refreshFailure: 45_000,
  /** 止めたブローカーを戻してから、ヘルスチェックが通るまで。compose のヘルスチェックの間隔と回数に合わせる */
  brokerRestore: 60_000,
  /** エビデンスの spec の 1 本。字幕ごとに止め、撮った後に mp4 へ変換するので、E2E の 1 本より長い */
  evidence: 180_000,
}

/** Storybook の、応答を遅らせた story の読み込みと送信が終わるのを待つ expect に渡す。 */
export const SLOW_STORY_WAIT = { timeout: TIMEOUT_MS.action }

/**
 * widgets/scroll の、スクロールが止まるのを待つ waitForFunction に渡す。スクロールは操作の続きなので、操作と同じ時間にする。
 * CI の 5 回の実行で、スクロールを含むテストは 1 本が最大 715ms で終わり、止まるまでの待ちはこの時間に届かない
 */
export const SCROLL_IDLE_WAIT = { timeout: TIMEOUT_MS.action }

/** 止めた職員がログインの画面へ戻るまで開き直す toPass に渡す。 */
export const SUSPENSION_WAIT = { timeout: TIMEOUT_MS.suspension }

/** 止めた職員がログインの画面へ戻るのを待つ spec の describe.configure に渡す。待つ間とログインの手順を足す。 */
export const SUSPENSION_TEST = { timeout: TIMEOUT_MS.suspension + TIMEOUT_MS.test }

/** ログインの仕組みの故障の中で開いた画面が、refresh の失敗の表示になるのを待つ expect に渡す。 */
export const REFRESH_FAILURE_WAIT = { timeout: TIMEOUT_MS.refreshFailure }

/** 戻したブローカーのヘルスチェックが通るのを待つ toPass に渡す。 */
export const BROKER_RESTORE_WAIT = { timeout: TIMEOUT_MS.brokerRestore }

/** ログインの仕組みの故障を入れるエビデンスの spec の describe.configure に渡す。改修前の失敗の待ちを 2 回含む。 */
export const SESSION_FAULT_TEST = { timeout: TIMEOUT_MS.evidence + TIMEOUT_MS.refreshFailure * 2 }
