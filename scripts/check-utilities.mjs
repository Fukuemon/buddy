#!/usr/bin/env node
// 画面とコンポーネントのコードに、DESIGN.md の「画面を作るときの原則」に反するユーティリティのクラスが書かれていないかを確認する。
// 色の値とプリミティブトークンの名前は check-raw-values.mjs が見る。
// コピーした後に、TARGETS、EXCLUDES、RULES を、自分のリポジトリとデザインシステムの文書に合わせて書き換える。
// 使い方: node check-utilities.mjs [--doc <デザインシステムの DESIGN.md>] [ファイルかディレクトリ]...
//   --doc を渡すと、コードを読む前に、RULES の各 id が文書の中にコードスパン（`TEXT-MIN-SIZE`）で出るかを見る。出ない id があれば、id を出して終了コード 2 で止める。
//     原則を消すか改名して文書のどこからも ID が消えたのに、RULES が古い ID のまま残るのを見つけるためである。ID が文書の 1 か所（表など）に残っていれば通る。
//     文書の表の形は読まない。逆向き（文書がこのチェックで見ると書いた原則が RULES に無い）は見ない。
//   引数のパスを省くと TARGETS を読む。ディレクトリは、EXTENSIONS の拡張子のファイルを再帰で読む。node_modules と、. で始まるディレクトリは読まない。
// クラスの名前は、変種を : でつなぎ（focus-visible:ring-2）、任意値を [ ] か ( ) で書く（p-[13px]、gap-(--gap)）形として読む。
//   空白と引用符で区切り、[ ] と ( ) の外では波括弧、カンマ、セミコロン、=、<、> でも区切った語を、クラスの名前として読む。コメントの中の語も読む。
//   言語の構文は読まず、語の区切りを近似で見分ける。
// 見つけないもの: クラスの名前を文字列の連結で組み立てた書き方と、任意の変種の中に引用符を書いた書き方（[&[data-state='open']]:text-xs）。それらはレビューで見る。
//   引用符は、配列（["text-xs"]）と関数の引数（cn("text-xs")）の区切りと見分けられないので、いつでも区切りにする。
//   ALLOW_MARK を含む行は見ず、外した行の数を出す。外す理由は、同じ行のコメントに書く。
// 違反の行には、RULES の id（デザインシステムの文書の原則の ID）を出す。
// 終了コード: 0 は見つからなかった、1 は見つかった、2 はパスが読めないか、引数が正しくないか、RULES の id が文書に無い
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

// 画面とコンポーネントのコードの置き場
const TARGETS = ["./apps/web/src", "./apps/broker/src", "./packages/ui/src"];
// トークンの層のファイルと生成物のように、原則の外にある置き場
const EXCLUDES = ["./packages/ui/src/tokens", "./apps/web/src/api/generated"];
const EXTENSIONS = [".css", ".ts", ".tsx", ".mdx"];
const ALLOW_MARK = "design-system-allow";

// 見つけるユーティリティ。id はデザインシステムの文書の原則の ID、label は違反の行に出す説明。
// test は、変種の配列（focus-visible:ring-2 なら ["focus-visible"]）と、変種を除いたユーティリティ（ring-2）を受け取る。
const SPACING = "-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])";
const RULES = [
  {
    id: "TEXT-MIN-SIZE",
    label: "14px より小さい文字か、文字の大きさの任意値",
    // text-sm/6 のように / の後に行高を付けた書き方も見る。text-smoke のような色の名前は見ない
    // 任意値は、数字で始まる値と、length: で文字の大きさと示した値（calc() と var() を含む）を見る。text-[var(--x)] は色の任意値にもなるので見ない
    test: (variants, utility) => /^text-(?:(?:xs|sm)(?:\/|$)|\[(?:length:|[\d.])|\(length:)/.test(utility),
  },
  {
    id: "FOCUS-ONE",
    label: "フォーカスのユーティリティ以外のフォーカスの表示",
    test: (variants, utility) =>
      variants.some((v) => v.includes("focus")) && /^(?:ring|outline|border|shadow)(?:-|$)/.test(utility),
  },
  {
    id: "SPACING-SCALE",
    label: "余白の任意値",
    test: (variants, utility) => new RegExp(`^${SPACING}-[[(]`).test(utility),
  },
  {
    id: "MOTION-TOKEN",
    label: "アニメーションか緩急の任意値",
    // アニメーションの任意値はテーマ変数を通らないので、動きを減らす設定でテーマ変数を置き換える止め方では止まらない。
    // 緩急の任意値は止め方に関わらないが、色の値と同じく、トークンを通らない値として見る。
    // duration-* と delay-* は、テーマ変数の名前空間が無く、トークンを任意値の var() で指すほかないので見ない。
    // transition-[...] は、遷移の対象を選ぶ書き方で、止め方が transition-property を透明度に絞るので見ない。
    test: (variants, utility) => /^(?:animate|ease)-[[(]/.test(utility),
  },
];

const excluded = EXCLUDES.map((p) => resolve(p));
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
let doc;
const paths = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--doc") {
    doc = process.argv[++i];
    if (doc === undefined || doc === "") {
      console.error(`${arg} の次に値が要る`);
      process.exit(2);
    }
  } else paths.push(arg);
}

if (doc !== undefined) {
  let text;
  try {
    text = readFileSync(resolve(doc), "utf8");
  } catch (e) {
    console.error(`読めない: ${doc}\n${e.message}`);
    process.exit(2);
  }
  const missing = RULES.map((r) => r.id).filter((id) => !text.includes(`\`${id}\``));
  if (missing.length) {
    for (const id of missing) console.error(`文書に無い原則の ID: ${id}（${doc}）`);
    console.error("RULES の id を、デザインシステムの文書の原則の ID に合わせる。原則を消したなら、RULES の規則も消す");
    process.exit(2);
  }
}

for (const p of paths.length ? paths : TARGETS) collect(p);

// 任意値は空白を含まないので、空白と引用符はいつでも区切りにする。関数の呼び出し（cn("text-xs", x)）の ( の後ろを 1 語にまとめないためである。
// [ ] と ( ) の中のカンマと =（has-[:is(:focus,:focus-visible)]:、[&[data-state=open]]:）は区切りにしない。
// = と < と > は、属性の値の前と後（class:text-xs={small}、<p class=text-xs>）で区切るために足す。
const tokenize = (line) => {
  const tokens = [];
  let depth = 0;
  let current = "";
  const flush = () => {
    if (current) tokens.push(current);
    current = "";
    depth = 0;
  };
  for (const c of line) {
    if (/[\s"'`]/.test(c) || (depth === 0 && /[{},;=<>]/.test(c))) {
      flush();
      continue;
    }
    if (c === "[" || c === "(") depth++;
    else if ((c === "]" || c === ")") && depth > 0) depth--;
    current += c;
  }
  flush();
  return tokens;
};

// 任意値の [ ] と ( ) の中の :（has-[:focus-visible]:、text-[length:12px]、text-(length:--x)）では分けない
const splitVariants = (token) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === "[" || token[i] === "(") depth++;
    else if (token[i] === "]" || token[i] === ")") depth--;
    else if (token[i] === ":" && depth === 0) {
      parts.push(token.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(token.slice(start));
  return parts;
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
  text.split("\n").forEach((line, i) => {
    if (line.includes(ALLOW_MARK)) {
      allowed++;
      return;
    }
    for (const token of tokenize(line)) {
      const parts = splitVariants(token);
      // 末尾の ! は重要度の印（text-xs!）、先頭の ! は古い書き方（!text-xs）
      const utility = parts.pop().replace(/^!|!$/g, "");
      for (const { id, label, test } of RULES) {
        if (!test(parts, utility)) continue;
        found++;
        console.log(`${relative(".", file)}:${i + 1}: ${id} ${label} ${token}`);
      }
    }
  });
}

if (allowed) console.log(`${ALLOW_MARK} で外した行: ${allowed}`);
if (found) {
  console.log(`${found} か所に、画面を作るときの原則に反するユーティリティがある。デザインシステムの文書の、行の ID の原則に沿って直す`);
  process.exit(1);
}
console.log(`${files.length} 個のファイルに、画面を作るときの原則に反するユーティリティはなかった`);
