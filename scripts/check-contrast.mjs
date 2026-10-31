#!/usr/bin/env node
// 意味の段のトークンの組が、WCAG 2.2 のコントラスト比の基準に届くかを確認する。
// 写した後に、SOURCES、PREFIX、TEXT_PAIRS、NON_TEXT_PAIRS を、自分のトークンに合わせて書き換える。
// 使い方: node check-contrast.mjs [--root <ブロック>]... [CSS のファイルかパッケージのパス]...
//   --root は、:root のほかに画面に効く値として読むブロックを、報告に出た形（`[data-theme=dark]`、`@media (prefers-color-scheme: dark) :root`）で渡す。
//   ダークモードのように条件ごとの値があるときは、条件ごとに --root を替えて流す。--root を渡すと、ほかの条件つきのブロックの意味の段の宣言は読み飛ばして数を出す
//   引数を省くと SOURCES を読む。リポジトリの中のファイルは ./ で始める。
//   パッケージのパス（`@scope/name/dist/tokens.css` の形）は、カレントディレクトリの package.json から解決する
// 読む値: :root のブロック（`:root, :host` のようなセレクタの並びと、@layer の中を含む）の変数の宣言だけを、画面に効く値として読む。
//   値は、var() の参照（空白とフォールバックを含む）、#rgb、#rrggbb を受ける。同じ変数の値は、CSS のカスケードの順（!important、@layer の順、後の宣言）で決める。
//   rgb()、hsl()、色の名前、calc() は色に解決できないと報告する。
//   :root 以外のブロックと @media などの中の宣言は、PREFIX の変数なら確認できないと報告し、ほかの変数（基本の段）は読み飛ばして数を出す
// 終了コード: 0 は全部の組が基準に届いた、1 は届かない組か、色に解決できないトークンか、条件つきのブロックの中の意味の段の宣言か、CSS にない --root のブロックがある、2 は CSS が読めない
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";

// 基本の段の CSS を先に、意味の段の CSS を後に並べる。同じ名前は後の値が勝つ
// DADS の基本の段は packages/ui の依存なので、ルートの package.json からは解決できない。pnpm が packages/ui の下に置くリンクを読む
const SOURCES = [
  "./packages/ui/node_modules/@digital-go-jp/design-tokens/dist/tokens.css",
  "./packages/ui/src/tokens/semantic.css",
];
// 意味の段のトークンの接頭辞。組の名前に付けて CSS の変数の名前にする
const PREFIX = "--buddy-color-";

// 文字と、その下の面の組。4.5:1 以上
const TEXT_PAIRS = [
  ...["surface", "surface-canvas", "surface-subtle", "primary-surface"].flatMap((bg) => [
    ["text", bg],
    ["text-secondary", bg],
  ]),
  ["primary", "surface"],
  ["primary", "surface-canvas"],
  ["primary", "primary-surface"],
  ...["danger", "warning", "success"].flatMap((state) => [
    [state, "surface"],
    [state, "surface-canvas"],
    [state, `${state}-surface`],
    ["text", `${state}-surface`],
  ]),
  ["text-inverse", "primary"],
  // 確認のダイアログの確定のボタン（Button の danger）は、赤い面に白の文字を載せる
  ["text-inverse", "danger"],
  // 区別の色は、白の文字を載せる
  ...Array.from({ length: 10 }, (_, i) => ["text-inverse", `categorical-${i + 1}`]),
];

// 文字でないもの（入力欄と押せるものの枠、フォーカスの表示）と、その下の面の組。3:1 以上
const NON_TEXT_PAIRS = [
  ["border-field", "surface"],
  ["border-field", "surface-canvas"],
  ["border-field", "surface-subtle"],
  ["border-field", "primary-surface"],
  ["primary", "surface"],
  ["primary", "surface-canvas"],
  ["danger", "surface"],
  ["focus-outline", "surface"],
  ["focus-outline", "surface-canvas"],
  ["focus-outline", "focus-halo"],
];

const MAX_DEPTH = 10;
const roots = [];
const args = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--root") roots.push(process.argv[++i] ?? "");
  else args.push(process.argv[i]);
}
const sources = args.length ? args : SOURCES;
const properties = new Map();
const conditional = [];
let skipped = 0;
let otherConditions = 0;
// :root の宣言を、現れた順に並べる。全部を読んでから、カスケードの順で値を決める
const declarations = [];
// 名前のある @layer を、最初に現れた順に並べる。後の layer ほど通常の宣言で勝つ
const layers = [];
let anonymous = 0;
const matchedRoots = new Set();
for (const source of sources) {
  let css;
  try {
    css = readFileSync(locate(source), "utf8");
  } catch (e) {
    console.error(`読めない: ${source}\n${e.message}`);
    process.exit(2);
  }
  // コメントに残した古い値や例の宣言を、今の値として読まない
  readDeclarations(css.replace(/\/\*[\s\S]*?\*\//g, ""), source);
}
// 優先度が大きいほど勝ち、同じなら後の宣言が勝つ
const ranks = new Map();
for (const d of declarations) {
  // --root で渡したブロックは、:root より詳細度が高いものとして扱う。セレクタの詳細度は計算しない
  const rank = cascadeRank(d.layer, d.important) * 2 + (d.selected ? 1 : 0);
  if (rank >= (ranks.get(d.name) ?? -Infinity)) {
    properties.set(d.name, d.value);
    ranks.set(d.name, rank);
  }
}
const unmatched = roots.filter((r) => !matchedRoots.has(r));
if (unmatched.length) {
  console.error(`--root のブロックが CSS にない: ${unmatched.map((r) => `"${r}"`).join("、")}。セレクタの名前を直す`);
  process.exit(1);
}
if (skipped) console.error(`:root 以外のブロックか条件つきのブロックにある基本の段の宣言を ${skipped} 個読み飛ばした`);
if (otherConditions) console.error(`--root の外の条件つきのブロックにある意味の段の宣言を ${otherConditions} 個読み飛ばした`);

if (conditional.length) {
  console.error(`条件つきのブロック（@media、:root 以外のセレクタなど）の中の意味の段の宣言は確認できない。画面に効く値として読むなら、ブロックを --root で渡して流す\n${conditional.join("\n")}`);
  process.exit(1);
}

const failures = [];
const check = (pairs, minimum) => {
  for (const [fg, bg] of pairs) {
    try {
      const ratio = contrast(color(fg), color(bg));
      if (ratio < minimum) failures.push(`${fg} は ${bg} の上で ${ratio.toFixed(2)}:1。${minimum}:1 以上が要る`);
    } catch (e) {
      failures.push(e.message);
    }
  }
};
check(TEXT_PAIRS, 4.5);
check(NON_TEXT_PAIRS, 3);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`${TEXT_PAIRS.length + NON_TEXT_PAIRS.length} 組が基準に届いた`);

// ブロックの入れ子をたどり、:root のブロックの宣言を properties に、ほかのブロックの意味の段の宣言を conditional に入れる
function readDeclarations(css, source) {
  const blocks = [];
  let text = "";
  // @layer は条件ではないので、ブロックの名前から外す
  const key = () => blocks.filter((b) => !/^@layer\b/.test(b)).join(" ");
  // 外側のブロックが @layer だけで、一番内側のセレクタの並びに :root があるときだけ、条件のない値とみなす
  const isPlainRoot = () =>
    blocks.slice(0, -1).every((b) => /^@layer\b/.test(b)) && blocks.at(-1).split(",").some((s) => s.trim() === ":root");
  const isRoot = () => {
    if (isPlainRoot()) return true;
    if (!roots.includes(key())) return false;
    matchedRoots.add(key());
    return true;
  };
  const layerName = () => blocks.filter((b) => /^@layer\b/.test(b)).map(nameOf).join(".");
  const flush = () => {
    const statement = /^@layer\s+([^{]+)$/.exec(text.trim());
    if (statement) for (const n of statement[1].split(",")) order([layerName(), n.trim()].filter(Boolean).join("."));
    const m = /^(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(text.trim());
    text = "";
    if (!m || !blocks.length) return;
    const important = /!important\s*$/i.test(m[2]);
    const value = m[2].replace(/\s*!important\s*$/i, "").trim();
    if (isRoot()) declarations.push({ name: m[1], value, layer: layerName(), important, selected: !isPlainRoot() });
    else if (m[1].startsWith(PREFIX) && roots.length) otherConditions++;
    else if (m[1].startsWith(PREFIX)) conditional.push(`${source}: ${key()} の ${m[1]}`);
    else skipped++;
  };
  for (const ch of css) {
    if (ch === "{") {
      const prelude = text.trim().replace(/\s+/g, " ");
      // 名前のない @layer は、それぞれ別の layer にする
      blocks.push(prelude === "@layer" ? `@layer (anonymous ${anonymous++})` : prelude);
      if (/^@layer\b/.test(blocks.at(-1))) order(layerName());
      text = "";
    } else if (ch === "}") {
      flush();
      blocks.pop();
    } else if (ch === ";") flush();
    else text += ch;
  }
}

function nameOf(block) {
  return block.replace(/^@layer\s*/, "").trim();
}

function order(name) {
  if (name && !layers.includes(name)) layers.push(name);
}

// CSS のカスケードの順。通常の宣言は、layer の中より layer の外が、前の layer より後の layer が勝つ。!important は全部の通常の宣言に勝ち、layer の順が逆になる。
// 入れ子の layer は、名前を . でつないだ 1 つの layer として順に並べる。親と子の layer の順の細かい規則は扱わない
function cascadeRank(layer, important) {
  const base = layers.length + 1;
  const position = layer ? layers.indexOf(layer) : base;
  return important ? 2 * base + (layer ? base - position : 0) : position;
}

function locate(source) {
  if (isAbsolute(source) || source.startsWith(".")) return resolve(source);
  return createRequire(join(process.cwd(), "package.json")).resolve(source);
}

// var() の参照をたどり、6 桁の 16 進の色にする。参照の先がなければフォールバックを使う
function color(token) {
  let value = `var(${PREFIX}${token})`;
  const seen = new Set();
  for (;;) {
    const ref = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+?))?\s*\)$/.exec(value);
    if (!ref) break;
    if (seen.has(ref[1])) throw new Error(`${token} の参照が ${ref[1]} で循環する`);
    if (seen.size >= MAX_DEPTH) throw new Error(`${token} の参照が ${MAX_DEPTH} 段を超える`);
    seen.add(ref[1]);
    if (properties.has(ref[1])) value = properties.get(ref[1]);
    else if (ref[2] !== undefined) value = ref[2];
    else throw new Error(`${ref[1]} が定義されていない（${token}）`);
  }
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) value = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${token} の値 ${value} は 16 進の色でない`);
  return value;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
