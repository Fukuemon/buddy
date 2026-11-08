#!/usr/bin/env node
// 画面とコンポーネントのコードに、色の値とプリミティブトークンの変数の名前が直に書かれていないかを確認する。
// コピーした後に、TARGETS、EXCLUDES、BASE_PREFIXES を、自分のリポジトリに合わせて書き換える。
// 使い方: node check-raw-values.mjs [--prefix <プリミティブトークンの接頭辞>]... [--exclude <パス>]... [ファイルかディレクトリ]...
//   引数のパスを省くと TARGETS を読む。--prefix と --exclude を渡すと、BASE_PREFIXES と EXCLUDES の代わりに使う。
//   ディレクトリは、EXTENSIONS の拡張子のファイルを再帰で読む。node_modules と、. で始まるディレクトリは読まない。
// 見つけるもの: 16 進の色（#fff、#ffffff、#ffffff80）、色の関数（rgb()、hsl()、oklch()、color() など）、BASE_PREFIXES で始まる変数の名前。
// 見つけないもの: 色の名前（red、transparent、currentColor）と、色でない値（文字の大きさ、余白、角丸、影の px と rem）。それらはレビューで見る。
//   コメント（/* */、<!-- -->、CSS 以外の行の // の後）の中は見ない。引用符の中と URL の // と /* はコメントにしない。issue の番号のような # を色と判定しないためである。
//   ALLOW_MARK を含む行は見ず、外した行の数を出す。外す理由は、同じ行のコメントに書く。
//   CSS の id のセレクタと private のフィールドの宣言で 16 進に見える名前（#add、#fade）と、color という名前の関数の呼び出しは、誤って色と判定する。その行は ALLOW_MARK で外す。
//   言語の構文は読まず、文字列とコメントの区切りを近似で見分ける。見つからない書き方と、誤って色と判定する書き方がありうる。
//     mdx と HTML の本文の「PR #165」のように、16 進に見える番号は色と判定する。その行は ALLOW_MARK で外す。
//     JSX の本文の ' （Don't）の後と、正規表現のリテラルの中の ` の後は、文字列の中として読むので、同じ行のコメントの中の色を判定する。
// 違反の行には、PRINCIPLE_ID（デザインシステムの文書の原則の ID）を出す。
// 終了コード: 0 は見つからなかった、1 は見つかった、2 はパスが読めないか、引数が正しくない
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

// 画面とコンポーネントのコードの置き場
const TARGETS = ["./apps/web/src", "./apps/broker/src", "./packages/ui/src"];
// 値とプリミティブトークンの名前を持ってよい置き場。トークンの層のファイル、生成物（API のクライアントのように、生成し直して差分を見るもの）、
// 色の値を並べるトークンのカタログのページを並べる。生成物とトークンのカタログのページは、画面のコードではない。buddy のトークンのカタログのページは、トークンの層と同じ packages/ui/src/tokens にある
const EXCLUDES = ["./packages/ui/src/tokens", "./apps/web/src/api/generated"];
// プリミティブトークンの変数の名前の接頭辞
const BASE_PREFIXES = ["--buddy-primitive-"];
const EXTENSIONS = [".css", ".scss", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro", ".html", ".mdx"];
const ALLOW_MARK = "design-system-allow";
// 違反の行に出す、デザインシステムの文書の原則の ID
const PRINCIPLE_ID = "COLOR-TOKEN";

const prefixes = [];
const excludes = [];
const paths = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--prefix" || arg === "--exclude") {
    const value = process.argv[++i];
    if (value === undefined || value === "") {
      console.error(`${arg} の次に値が要る`);
      process.exit(2);
    }
    (arg === "--prefix" ? prefixes : excludes).push(value);
  } else paths.push(arg);
}
const basePrefixes = prefixes.length ? prefixes : BASE_PREFIXES;
const excluded = (excludes.length ? excludes : EXCLUDES).map((p) => resolve(p));

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = [
  // 直前が英数字、&（文字参照）、.（private のフィールド）なら色にしない。_ はユーティリティのクラスの値の区切り（0_2px_8px_#000、#fff_0%）なので、前後にあっても色にする
  { label: "色の値", re: /(?<![A-Za-z0-9&.#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![A-Za-z0-9-])/g },
  // CSS の関数の名前は、大文字と小文字を区別しない。色の値と同じく、_ の直後も色にする
  { label: "色の関数", re: /(?<![A-Za-z0-9.-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi },
  ...basePrefixes.map((p) => ({ label: "プリミティブトークンの名前", re: new RegExp(`${escape(p)}[\\w-]+`, "g") })),
];

const isExcluded = (abs) => excluded.some((e) => abs === e || abs.startsWith(e + sep));

// 読めないパス（壊れたシンボリックリンクを含む）は、読めなかったファイルを通ったことにしないよう、終了コード 2 で止める
const statOrExit = (p) => {
  try {
    return statSync(p);
  } catch (e) {
    console.error(`読めない: ${relative(".", p) || p}\n${e.message}`);
    process.exit(2);
  }
};

const files = [];
const collect = (p) => {
  const abs = resolve(p);
  if (isExcluded(abs)) return;
  const stat = statOrExit(abs);
  if (stat.isDirectory()) {
    for (const name of readdirSync(abs).sort()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const child = join(abs, name);
      if (statOrExit(child).isDirectory() || EXTENSIONS.includes(extname(name))) collect(child);
    }
  } else files.push(abs);
};
for (const p of paths.length ? paths : TARGETS) collect(p);

const blank = (s) => s.replace(/[^\n]/g, " ");
// 閉じる印の後ろの位置を返す。閉じていないコメントは、ファイルの終わりまで続く。行のコメントは改行を残す
const close = (text, marker, from, includeMarker = true) => {
  const at = text.indexOf(marker, from);
  if (at === -1) return text.length;
  return includeMarker ? at + marker.length : at;
};
// コメントを空白に置き換える。改行は残し、行の番号をずらさない
// 引用符の中は文字列なので、コメントの印があってもそのまま残す。' と " の文字列は行末で閉じたものとして扱う
const stripComments = (text, lineComments) => {
  let out = "";
  let quote = null;
  // テンプレートの文字列の ${ } の中はコードとして読む。入れ子ごとに、${ を開いた時点の { の深さを積む
  const templates = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      // テンプレートの文字列には CSS を書くことがある（CSS-in-JS）ので、/* */ のコメントを除く
      // 閉じる */ がテンプレートの終わりの ` より後ろにあるなら、コメントではなく文字（image/* など）として残す
      const commentEnd = quote === "`" && text.startsWith("/*", i) ? text.indexOf("*/", i + 2) : -1;
      if (commentEnd !== -1 && !text.slice(i, commentEnd).includes("`")) {
        const end = commentEnd + 2;
        out += blank(text.slice(i, end));
        i = end - 1;
        continue;
      }
      if (quote === "`" && text.startsWith("${", i)) {
        out += "${";
        i++;
        templates.push(depth);
        depth = 0;
        quote = null;
        continue;
      }
      if (c === "\\" && text[i + 1] !== "\n") {
        out += c + (text[i + 1] ?? "");
        i++;
        continue;
      }
      out += c;
      if (c === quote || (c === "\n" && quote !== "`")) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}" && templates.length) {
      if (depth === 0) {
        // ${ } が閉じ、テンプレートの文字列に戻る
        depth = templates.pop();
        quote = "`";
        out += c;
        continue;
      }
      depth--;
    }
    let end = -1;
    if (text.startsWith("/*", i)) end = close(text, "*/", i + 2);
    else if (text.startsWith("<!--", i)) end = close(text, "-->", i + 4);
    // CSS は // をコメントにしない。ほかのファイルでも、行の初め、空白、; { } , ) の直後の // だけをコメントにする。
    // https:// や url(//cdn...) や src=//cdn... の // は URL の一部なので、コメントにしない
    else if (lineComments && text.startsWith("//", i) && (i === 0 || /[\s;{},)]/.test(text[i - 1]))) end = close(text, "\n", i + 2, false);
    else {
      out += c;
      continue;
    }
    out += blank(text.slice(i, end));
    i = end - 1;
  }
  return out;
};

let found = 0;
let allowed = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`読めない: ${relative(".", file)}\n${e.message}`);
    process.exit(2);
  }
  const original = text.split("\n");
  const code = stripComments(text, extname(file) !== ".css").split("\n");
  code.forEach((line, i) => {
    if (original[i].includes(ALLOW_MARK)) {
      allowed++;
      return;
    }
    for (const { label, re } of patterns) {
      for (const m of line.matchAll(re)) {
        found++;
        console.log(`${relative(".", file)}:${i + 1}: ${PRINCIPLE_ID} ${label} ${m[0]}`);
      }
    }
  });
}

if (allowed) console.log(`${ALLOW_MARK} で外した行: ${allowed}`);
if (found) {
  console.log(`${found} か所に、色の値かプリミティブトークンの名前がある。セマンティックトークンかテーマ変数の名前に替える`);
  process.exit(1);
}
console.log(`${files.length} 個のファイルに、色の値とプリミティブトークンの名前はなかった`);
