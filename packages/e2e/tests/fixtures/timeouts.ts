/** 待つ時間（ミリ秒）。内側から expect < 操作 < 外部の読み込み < テストの全体の順に長くする。 */
export const TIMEOUTS = {
  expect: 5_000,
  action: 10_000,
  navigation: 15_000,
  test: 60_000,
}
