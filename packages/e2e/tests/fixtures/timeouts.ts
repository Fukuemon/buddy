/** 待つ時間（ミリ秒）。内側から expect < 操作 < 外部の読み込み < テストの全体の順に長くする。 */
export const TIMEOUTS = {
  expect: 5_000,
  action: 10_000,
  navigation: 15_000,
  test: 60_000,
  /** エビデンスの spec の 1 本。字幕ごとに止め、撮った後に mp4 へ変換するので、E2E の 1 本より長い */
  evidence: 180_000,
}
