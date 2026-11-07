import dns from 'node:dns'

/**
 * Node.js の名前の解決で、`*.localhost` を loopback のアドレスに引くようにする。
 *
 * ローカル環境は、portless の `https://<サービス>.<プロジェクト>.localhost` で動く（ADR-0035）。
 * ブラウザは `*.localhost` を自分で loopback に引くが、macOS の Node.js は `/etc/hosts` に無い名前を引けない。
 * Playwright の request は、名前を引くたびに `dns.promises.lookup` を呼ぶので、ここを差し替える。
 * `*.localhost` 以外の名前は、元の関数に渡す。
 */
export const resolveLocalhostToLoopback = () => {
  const original = dns.promises.lookup.bind(dns.promises)
  const isLocalhost = (hostname: string) => hostname.toLowerCase().endsWith('.localhost')
  dns.promises.lookup = (async (hostname: string, options?: dns.LookupOptions) => {
    if (!isLocalhost(hostname)) return original(hostname, options ?? {})
    const addresses = (options?.family === 6 ? [] : [{ address: '127.0.0.1', family: 4 }]).concat(
      options?.family === 4 ? [] : [{ address: '::1', family: 6 }],
    )
    return options?.all ? addresses : addresses[0]
  }) as typeof dns.promises.lookup
}
