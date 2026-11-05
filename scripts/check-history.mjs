// Design Doc と context に、変更履歴の見出しと issue の番号がないかを確認する。agent-harness の docs-v0.2.11 から写した（doc-checks.mjs の冒頭）。
// 使い方: node scripts/check-history.mjs [ファイル]... [--exclude <パス>]...。ファイルを省くと、Git が追跡する Markdown と、まだ追跡していない Markdown（.gitignore で外したものを除く）の全部を見る
// 終了コード: 0 は変更履歴の見出しがない、1 はある、2 はファイルが読めない。issue の番号は一覧を出すだけで、終了コードを変えない
import { readFileSync } from "node:fs";
import { historyFindings, isHistoryTarget, markdownFiles } from "./doc-checks.mjs";

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
  if (!isHistoryTarget(body)) continue;
  for (const h of historyFindings(body)) {
    if (h.kind === "heading") {
      failed++;
      console.log(`${file}:${h.line}: 変更履歴の見出し: ${h.text}`);
    } else console.log(`${file}:${h.line}: issue の番号 ${h.text}。解決済みなら記述ごと消す`);
  }
}
process.exit(failed ? 1 : 0);
