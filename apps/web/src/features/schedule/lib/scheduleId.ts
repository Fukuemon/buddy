const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * 画面が予定を作るときに送る、新しい予定の ID を ULID の形（26 文字の Crockford の Base32）で作る。
 * 先頭の 10 文字は now のミリ秒の時刻で、残りの 16 文字は暗号論的な乱数である。
 * google_primary の事業所では、予定の API がこの ID から Google の予定の ID を決めるので、送り直しても予定は 1 つのままになる（ADR-0028）。
 *
 * 出典: https://github.com/ulid/spec
 */
export const newScheduleId = (now: number = Date.now()): string => {
  let time = ''
  let rest = now
  for (let i = 0; i < 10; i += 1) {
    time = CROCKFORD[rest % 32] + time
    rest = Math.floor(rest / 32)
  }
  const random = crypto.getRandomValues(new Uint8Array(16))
  let tail = ''
  for (const byte of random) tail += CROCKFORD[byte % 32]
  return time + tail
}
