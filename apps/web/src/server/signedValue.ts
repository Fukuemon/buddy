import { createHmac, timingSafeEqual } from 'node:crypto'

const sign = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('base64url')

/** value に HMAC-SHA256 の署名を付けた `value.署名` を返す。value は `.` を含まない。 */
export const signValue = (value: string, secret: string) => `${value}.${sign(value, secret)}`

/** signValue の結果の署名を確かめ、value を返す。形か署名が誤っていれば undefined を返す。 */
export const verifySignedValue = (signed: string | undefined, secret: string) => {
  if (signed === undefined) return undefined
  const dot = signed.lastIndexOf('.')
  if (dot <= 0) return undefined
  const value = signed.slice(0, dot)
  const actual = Buffer.from(signed.slice(dot + 1))
  const expected = Buffer.from(sign(value, secret))
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined
  return value
}
