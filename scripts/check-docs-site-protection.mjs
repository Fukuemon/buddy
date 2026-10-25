#!/usr/bin/env node
// 公開した文書のサイトの 1 つの URL が保護されていることを、認証のない要求で確認する。
// リダイレクトを 1 つずつたどり、着いた先が指定した認証の画面のホストかそのサブドメインであり、途中と最後の応答に保護した中身の文字列がなければ保護されている。
// サブパスに置いたカタログや図は、URL と文字列を替えて 1 つずつ流す。
// 使い方: node scripts/check-docs-site-protection.mjs <サイトの URL> <保護した中身にだけある文字列> <認証の画面のホスト>
// 終了コード: 0 は保護されている、1 は保護されていない、2 は引数の誤りか要求の失敗

const USAGE = "使い方: node scripts/check-docs-site-protection.mjs <サイトの URL> <保護した中身にだけある文字列> <認証の画面のホスト>";
const MAX_REDIRECTS = 10;
const [url, marker, authArg] = process.argv.slice(2);
if (!url || !marker || !authArg) fail(2, USAGE);

let site;
try {
  site = new URL(url);
} catch {
  fail(2, `URL ではない: ${url}`);
}
const authHost = authArg.toLowerCase();
const isAuthHost = (hostname) => hostname === authHost || hostname.endsWith(`.${authHost}`);
if (isAuthHost(site.hostname)) fail(2, `認証の画面のホストに、サイトのホストかその上位のドメインを渡している: ${authHost}`);

let current = site;
let res;
for (let hops = 0; ; hops++) {
  try {
    res = await fetch(current, { redirect: "manual" });
  } catch (e) {
    fail(2, `要求が失敗した: ${current}\n${e.message}`);
  }
  if ((await res.text()).includes(marker)) fail(1, `保護されていない: ${current} の応答に保護した中身がある`);
  const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
  if (!location) break;
  if (hops >= MAX_REDIRECTS) fail(2, `リダイレクトが ${MAX_REDIRECTS} 回を超えた: ${site}`);
  current = new URL(location, current);
}

if (current.hostname === site.hostname) fail(1, `保護されていない: ${site} が認証の画面へリダイレクトしない（ステータス ${res.status}）`);
if (!isAuthHost(current.hostname)) fail(1, `保護されていない: ${site} が ${authHost} の認証の画面へリダイレクトしない（着いた先 ${current}）`);
console.log(`保護されている: ${site} -> ${current.origin}${current.pathname}`);

function fail(code, message) {
  console.error(message);
  process.exit(code);
}
