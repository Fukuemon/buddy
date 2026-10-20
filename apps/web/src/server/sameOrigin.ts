const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * 状態を変える要求が、ほかのサイトのページから送られたものなら true を返す。cookie のセッションへの CSRF を防ぐ。
 *
 * Origin があればその host を要求の Host と比べ、無ければ Sec-Fetch-Site を見る。どちらも無い要求（curl など）は通す。
 * TLS を前段で終える構成でも scheme が食い違わないよう、scheme は比べない。
 */
export const isCrossSiteWrite = (request: Request) => {
  if (SAFE_METHODS.has(request.method)) return false
  const origin = request.headers.get('Origin')
  if (origin !== null) {
    try {
      return new URL(origin).host !== (request.headers.get('Host') ?? new URL(request.url).host)
    } catch {
      return true
    }
  }
  return request.headers.get('Sec-Fetch-Site') === 'cross-site'
}
