#!/usr/bin/env node
// 画面とコンポーネントのコードに、packages/ui/DESIGN.md の「画面を作るときの原則」に反する Tailwind のユーティリティが書かれていないかを確認する。
// 色の値と DADS の変数の名前は scripts/check-raw-values.mjs が見る。
// 使い方: node scripts/check-utilities.mjs [ファイルかディレクトリ]...
//   引数のパスを省くと TARGETS を読む。ディレクトリは、EXTENSIONS の拡張子のファイルを再帰で読む。node_modules と、. で始まるディレクトリは読まない。
// 見つけるもの:
//   14px より小さい文字: text-xs、text-sm と、文字の大きさの任意値（text-[10px]、text-[0.75rem]）
//   focus-ring 以外のフォーカスの表示: focus を含む変種（focus:、focus-visible:、focus-within:、has-[:focus-visible]:）の後ろの ring、outline、border、shadow
//   4px の段から外れた余白: padding、margin、gap、space の任意値（p-[13px]、gap-(--gap)）
// 見つけないもの: 0.5 のような半分の段と、クラスの名前を文字列の連結で組み立てた書き方。それらはレビューで見る。
//   空白、引用符、波括弧、カンマ、セミコロンで区切った語を、クラスの名前として読む。コメントの中の語も読む。
//   ALLOW_MARK を含む行は見ず、外した行の数を出す。外す理由は、同じ行のコメントに書く。
// 終了コード: 0 は見つからなかった、1 は見つかった、2 はパスが読めない
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

// 画面とコンポーネントのコードの置き場
const TARGETS = ["./apps/web/src", "./packages/ui/src"];
// トークンの段のファイルと生成物
const EXCLUDES = ["./packages/ui/src/tokens", "./apps/web/src/api/generated"];
const EXTENSIONS = [".css", ".ts", ".tsx", ".mdx"];
const ALLOW_MARK = "design-system-allow";

const SPACING = "-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])";
const rules = [
  {
    label: "14px より小さい文字か、文字の大きさの任意値",
    test: (variants, utility) => /^text-(?:xs|sm|\[(?:length:)?[\d.])/.test(utility),
  },
  {
    label: "focus-ring 以外のフォーカスの表示",
    test: (variants, utility) =>
      variants.some((v) => v.includes("focus")) && /^(?:ring|outline|border|shadow)(?:-|$)/.test(utility),
  },
  {
    label: "余白の任意値",
    test: (variants, utility) => new RegExp(`^${SPACING}-[[(]`).test(utility),
  },
];

const excluded = EXCLUDES.map((p) => resolve(p));
const isExcluded = (abs) => excluded.some((e) => abs === e || abs.startsWith(e + sep));

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
const paths = process.argv.slice(2);
for (const p of paths.length ? paths : TARGETS) collect(p);

const splitVariants = (token) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === "[") depth++;
    else if (token[i] === "]") depth--;
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
    for (const token of line.split(/[\s"'`{},;]+/)) {
      if (!token) continue;
      const parts = splitVariants(token);
      const utility = parts.pop().replace(/^!/, "");
      for (const { label, test } of rules) {
        if (!test(parts, utility)) continue;
        found++;
        console.log(`${relative(".", file)}:${i + 1}: ${label} ${token}`);
      }
    }
  });
}

if (allowed) console.log(`${ALLOW_MARK} で外した行: ${allowed}`);
if (found) {
  console.log(`${found} か所に、画面を作るときの原則に反するユーティリティがある。packages/ui/DESIGN.md の原則に沿って直す`);
  process.exit(1);
}
console.log(`${files.length} 個のファイルに、画面を作るときの原則に反するユーティリティはなかった`);
