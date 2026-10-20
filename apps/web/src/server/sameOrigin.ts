/**
 * Origin のヘッダーの値が、要求の Host と同じ host を指すなら true を返す。
 *
 * TLS を前段で終える構成では要求の URL の scheme が http になるので、scheme は比べない。
 */
export const isSameHostOrigin = (origin: string, request: Request) => {
  try {
    return new URL(origin).host === (request.headers.get('Host') ?? new URL(request.url).host)
  } catch {
    return false
  }
}
