/**
 * 本文を読む前に、Content-Length で max バイトを超える要求を見分ける。超えるか、長さの分からない本文なら true を返す。
 *
 * TanStack Start は、server function の validator を動かす前に本文の全部を読むため、読む前に止める。
 * ブラウザの fetch は FormData の本文にも Content-Length を付けるので、長さの分からない本文（chunked）は拒む。
 */
export const exceedsBodyLimit = (request: Request, max: number) => {
  const length = request.headers.get('Content-Length')
  if (length === null) return request.headers.has('Transfer-Encoding')
  const n = Number(length)
  return !Number.isFinite(n) || n > max
}
