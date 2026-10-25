// build-docs-site.mjs が読み込む。context/project.yml の docs_site のキーを読み、検証する。
// 依存を持たずに利用者のリポジトリで動かすため、YAML は次の形だけを読む。
//   docs_site の下はブロックのマッピング。parts はブロックの配列で、各要素はブロックのマッピング。
//   値は 1 行のスカラー（引用符のないもの、"..."、'...'）。exclude だけは、引用符のない名前のフローの配列 [a, b]。

/** 読めない形の値のファイル。build-docs-site.mjs は終了コード 2 にする。 */
export class FormError extends Error {}

const PART_KEYS = ["path", "subpath", "build", "exclude"];

/**
 * context/project.yml の本文から docs_site を読んで返す。docs_site が無ければ undefined を返す。
 * 上の形に当たらない行は FormError を投げる。値の正しさは validateDocsSite が見る。
 */
export function readDocsSiteConfig(text) {
  const lines = text.split(/\r?\n/).map((raw, i) => ({ no: i + 1, raw }));
  const start = lines.findIndex((l) => /^docs_site:/.test(l.raw));
  if (start === -1) return undefined;
  if (stripComment(lines[start].raw.slice("docs_site:".length)).trim()) formError(lines[start], "docs_site は、キーごとに行を分けたブロックの形で書く");

  const body = [];
  for (const l of lines.slice(start + 1)) {
    if (/^\S/.test(l.raw) && !l.raw.startsWith("#")) break;
    if (l.raw.includes("\t")) formError(l, "字下げにタブを使わない");
    if (l.raw.trim() === "" || l.raw.trim().startsWith("#")) continue;
    body.push({ ...l, indent: l.raw.length - l.raw.trimStart().length, text: l.raw.trim() });
  }

  const config = {};
  const indent = body[0]?.indent;
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    if (l.indent !== indent) formError(l, "docs_site の下のキーの字下げをそろえる");
    const { key, rest } = keyValue(l);
    if (key in config) formError(l, `キーが重なる: ${key}`);
    if (key !== "parts") {
      config[key] = scalar(l, rest);
      continue;
    }
    if (rest) formError(l, "parts は、次の行からブロックの配列で書く");
    const items = [];
    // YAML は、配列の - をキーと同じ字下げに置く形も許す
    while (i + 1 < body.length && (body[i + 1].indent > indent || (body[i + 1].indent === indent && body[i + 1].text.startsWith("- ")))) {
      items.push(body[++i]);
    }
    config.parts = readParts(items);
  }
  return config;
}

function readParts(items) {
  const parts = [];
  const dash = items[0]?.indent;
  let current, keyIndent;
  for (const l of items) {
    if (l.indent === dash && l.text.startsWith("- ")) {
      current = {};
      parts.push(current);
      keyIndent = dash + 2 + (l.text.slice(2).length - l.text.slice(2).trimStart().length);
      readPartKey(current, { ...l, text: l.text.slice(2).trimStart() });
    } else if (current && l.indent === keyIndent) {
      readPartKey(current, l);
    } else {
      formError(l, "parts の要素は、- で始まるブロックのマッピングで書き、キーの字下げをそろえる");
    }
  }
  return parts;
}

function readPartKey(part, l) {
  const { key, rest } = keyValue(l);
  if (key in part) formError(l, `キーが重なる: ${key}`);
  part[key] = key === "exclude" ? flowNames(l, rest) : scalar(l, rest);
}

function keyValue(l) {
  const m = /^([A-Za-z0-9_]+):(?:\s+(.*))?$/.exec(l.text) ?? /^([A-Za-z0-9_]+):()$/.exec(l.text);
  if (!m) formError(l, "キー: 値 の形で書く");
  return { key: m[1], rest: stripComment(m[2] ?? "").trim() };
}

// 引用符で囲んだ値は、行末のコメントだけを外す。囲まない値は、YAML で別の意味になる文字を拒む
function scalar(l, rest) {
  const raw = l.text.slice(l.text.indexOf(":") + 1).trim();
  const double = /^"([^"\\]*)"\s*(#.*)?$/.exec(raw);
  if (double) return double[1];
  const single = /^'((?:[^']|'')*)'\s*(#.*)?$/.exec(raw);
  if (single) return single[1].replaceAll("''", "'");
  if (rest === "") formError(l, "値を書く。空の文字列は \"\" と書く");
  if (/^["'|>{[&*!%@`]|^[-?]\s/.test(rest) || /:\s|:$/.test(rest)) {
    formError(l, "値は 1 行で書き、: や # を含むときは \" で囲む。\" の中では \\ と \" を使わない");
  }
  return rest;
}

function flowNames(l, rest) {
  const m = /^\[(.*)\]$/.exec(rest);
  if (!m) formError(l, "exclude は [名前, 名前] の形で書く");
  if (m[1].trim() === "") return [];
  return m[1].split(",").map((s) => {
    const name = s.trim();
    if (!name || /["'[\]{}#&*!|>]/.test(name) || /\s/.test(name)) formError(l, `exclude の名前は引用符で囲まずに書く: ${name}`);
    return name;
  });
}

function stripComment(raw) {
  return raw.replace(/(^|\s+)#.*$/, "");
}

function formError(l, message) {
  throw new FormError(`context/project.yml:${l.no}: ${message}: ${l.raw.trim()}`);
}

/**
 * docs_site の誤りを、人が読む文の配列で返す。schemas/docs-site.schema.json と同じ規則に、サブパスの重なりの確認を足す。
 */
export function validateDocsSite(config) {
  const errors = [];
  for (const key of Object.keys(config ?? {})) if (!["parts", "tokens_css"].includes(key)) errors.push(`docs_site: 知らないキー ${key}`);
  if (config?.tokens_css !== undefined && !isRelativePath(config.tokens_css)) errors.push("docs_site.tokens_css: リポジトリの中の相対パスで書く");
  const parts = config?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return [...errors, "docs_site.parts: 1 つ以上の part の配列にする"];
  parts.forEach((p, i) => {
    const at = `docs_site.parts[${i}]`;
    for (const key of Object.keys(p)) if (!PART_KEYS.includes(key)) errors.push(`${at}: 知らないキー ${key}`);
    if (!isRelativePath(p.path)) errors.push(`${at}.path: リポジトリの中の相対パスで書く`);
    if (p.subpath !== "" && !isRelativePath(p.subpath)) errors.push(`${at}.subpath: 空の文字列か、出力の中の相対パスで書く`);
    if (p.build !== undefined && (typeof p.build !== "string" || !p.build)) errors.push(`${at}.build: コマンドの文字列にする`);
    if (p.exclude !== undefined && (!Array.isArray(p.exclude) || !p.exclude.every((x) => typeof x === "string" && x && !x.includes("/")))) {
      errors.push(`${at}.exclude: ファイル名の配列にする`);
    }
  });
  // ルートの part の下に置く part は許す。ルート以外の subpath どうしは、同じものも入れ子も拒む
  const subs = parts.map((p) => p.subpath).filter((s) => typeof s === "string" && s !== "");
  subs.forEach((a, i) => {
    for (const b of subs.slice(i + 1)) if (nested(a, b) || nested(b, a)) errors.push(`docs_site.parts: subpath が重なる: "${a}" と "${b}"`);
  });
  if (parts.filter((p) => p.subpath === "").length > 1) errors.push("docs_site.parts: subpath が空の part は 1 つだけにする");
  return errors;
}

/** a が b と同じか、b の下のパスか。 */
export function nested(a, b) {
  return a === b || a.startsWith(`${b}/`);
}

/** 先頭と末尾の / がなく、空、.、.. の区切りを含まない相対パスか。 */
export function isRelativePath(p) {
  return typeof p === "string" && p !== "" && p.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}
