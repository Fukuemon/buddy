// Markdown の相対リンクの先のファイルと、見出しのアンカーが存在することを確認する。agent-harness の docs-v0.2.11 から写した（doc-checks.mjs の冒頭）。
// 使い方: node scripts/check-links.mjs [ファイル]... [--exclude <パス>]...。ファイルを省くと、Git が追跡する Markdown と、まだ追跡していない Markdown（.gitignore で外したものを除く）の全部を見る
// 終了コード: 0 はリンク切れがない、1 はある、2 はファイルが読めない
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brokenLinks, markdownFiles } from "./doc-checks.mjs";

let files;
try {
  files = markdownFiles(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  process.exit(2);
}
let failed = 0;
for (const file of files) {
  let body;
  try {
    body = readFileSync(file, "utf8");
  } catch (err) {
    console.error(`読めない: ${file}\n${err.message}`);
    process.exit(2);
  }
  for (const l of brokenLinks(resolve(file), body)) {
    failed++;
    console.log(`${file}:${l.line}: ${l.target}（${l.reason}）`);
  }
}
process.exit(failed ? 1 : 0);
