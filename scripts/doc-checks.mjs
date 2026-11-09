// 経緯の混入とリンクのチェック。scripts/check-history.mjs と scripts/check-links.mjs が読み込む。
// agent-harness の docs-v0.2.11 の packages/docs/hooks/doc-checks.mjs を写した。apm が置く .claude/hooks/docs/ は Git の外にあり、
// agent-harness は private なので CI で apm install を流せない。CI の文書のチェックのジョブがこの写しを流す（CONTRIBUTING.md の Editing Documents）
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const HISTORY = /変更履歴|更新履歴|改訂履歴|\bhistory\b|\bchangelog\b/i;
const ISSUE = /(^|[\s(（、。])#(\d+)\b/g;

/**
 * コマンドの引数から、チェックする Markdown を決める。ファイルを渡せばそれだけを、省けば Git が追跡するものと、まだ追跡していないものを見る。
 * `--exclude <パス>` は、省いたときの対象から外す。Git の pathspec の形で書く。`:(glob)` のような魔法の語は、exclude と 1 つの括弧にまとめる。
 */
export function markdownFiles(argv) {
  const files = [];
  const excludes = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--exclude") excludes.push(argv[++i]);
    else files.push(argv[i]);
  }
  // 空のパスは、:(exclude) だけになり、全部の Markdown を外すので、ないものと同じく拒む
  if (excludes.some((p) => !p)) throw new Error("--exclude にはパスが要る");
  if (files.length) return files;
  const pathspec = ["*.md", ...excludes.map(excludePathspec)];
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...pathspec], { encoding: "utf8" }).split("\0").filter(Boolean);
}

// 魔法の語の付いた pathspec に exclude を足す。:(glob)x は :(exclude,glob)x に、短い形の :/x は :(exclude,top)x にする。
// :!x と :^x は既に除外なので、そのまま渡す
// パターンが空の除外は、全部の Markdown を外すので拒む。attr: の付いた除外は、属性で絞るので、パターンがなくてもよい
function excludePathspec(p) {
  const long = /^:\(([^)]*)\)(.*)$/s.exec(p);
  const short = long ? undefined : /^:([/!^]*):?(.*)$/s.exec(p);
  const pattern = long?.[2] ?? short?.[2] ?? p;
  if (!pattern && !/(?:^|,)attr:[ \t]*\S/.test(long?.[1] ?? "")) throw new Error(`--exclude にはパターンが要る: ${p}`);
  if (long) return `:(exclude,${long[1]})${pattern}`;
  if (!short) return `:(exclude)${p}`;
  if (/[!^]/.test(short[1])) return p;
  return `:(exclude${short[1] ? ",top" : ""})${pattern}`;
}

/** Markdown の frontmatter の type を返す。frontmatter がなければ undefined。 */
export function docType(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  return block && /^type:[ \t]*["']?([\w-]+)/m.exec(block)?.[1];
}

/** 経緯の混入を見る文書か。Design Doc と context が当たる。 */
export function isHistoryTarget(text) {
  return ["design-doc", "feature-design", "context"].includes(docType(text));
}

/**
 * 変更履歴に当たる見出しと、issue の番号を返す。
 * 見出しは失敗として、番号は閉じているかを確認するための一覧として、kind で分ける。
 */
export function historyFindings(text) {
  const out = [];
  for (const { no, line } of proseLines(text)) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading && HISTORY.test(heading[1])) out.push({ kind: "heading", line: no, text: line.trim() });
    else for (const m of line.replace(/`[^`]*`/g, "").matchAll(ISSUE)) out.push({ kind: "issue", line: no, text: `#${m[2]}` });
  }
  return out;
}

/** 相対リンクの先のファイルと、見出しのアンカーが存在しないリンクを返す。file は、リンクを解決する基準の文書のパス。 */
export function brokenLinks(file, text) {
  const out = [];
  for (const { no, line } of proseLines(text)) {
    const prose = line.replace(/`[^`]*`/g, "");
    const inline = [...prose.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]);
    const reference = /^ {0,3}\[[^\]]+\]:\s*(\S+)/.exec(prose)?.[1];
    for (const target of reference ? [...inline, reference] : inline) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("<")) continue;
      const [path, anchor] = target.split("#");
      const dest = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
      if (!existsSync(dest)) out.push({ line: no, target, reason: "ファイルがない" });
      else if (anchor && statSync(dest).isFile() && dest.endsWith(".md") && !anchors(readFileSync(dest, "utf8")).has(decodeURIComponent(anchor).toLowerCase())) {
        out.push({ line: no, target, reason: "見出しがない" });
      }
    }
  }
  return out;
}

// GitHub と同じ規則で、見出しからアンカーを作る。同じ見出しには -1、-2 を付ける
function anchors(text) {
  const seen = new Map();
  const out = new Set();
  for (const { line } of proseLines(text)) {
    const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    const base = h[1].toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

function proseLines(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let i = 0;
  if (lines[0] === "---") {
    i = lines.indexOf("---", 1) + 1;
    if (i === 0) i = lines.length;
  }
  let fence = "";
  for (; i < lines.length; i++) {
    const f = /^\s*(```|~~~)/.exec(lines[i]);
    if (f) fence = fence ? (lines[i].trim().startsWith(fence) ? "" : fence) : f[1];
    else if (!fence) out.push({ no: i + 1, line: lines[i] });
  }
  return out;
}
