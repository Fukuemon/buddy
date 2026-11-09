// 要求とタスクの親子が write-issue-pr の issue の書き方の「要求の大きさと親子」に合わない issue を一覧する。issue は読むだけで、書き換えない。
// agent-harness の core の 0.3.1 の write-issue-pr の scripts/ から写した。CI の checkout にはスキルの配置先がないためである。core を上げたら写し直す
// 使い方: node scripts/check-issue-tree.mjs [--repo <owner>/<name>] [--max-children <数>] [--project <project.yml>] [--from <issue の一覧の JSON>]
// 既定は gh api graphql で、カレントディレクトリのリポジトリの issue を全部読む。--from は、同じ形の JSON の配列をファイルから読む
// 要求の種別は本文の「種別」の欄から読み、--project（既定は context/project.yml）の process.presets の tasks に verify がない種別は、検証のタスクを求めない
// 終了コード: 0 は合わない issue がない、1 はある、2 は issue を読めない
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const maxChildren = Number(opt("--max-children") ?? 10);

let issues;
try {
  issues = opt("--from") ? JSON.parse(readFileSync(opt("--from"), "utf8")) : fetchIssues(opt("--repo") ?? currentRepo());
} catch (err) {
  console.error(`issue を読めない: ${err.message}`);
  process.exit(2);
}

let presets = {};
try {
  presets = readPresets(readFileSync(opt("--project") ?? "context/project.yml", "utf8"));
} catch {
  // 値のファイルがなければ、どの要求の種別も分からないものとして扱う
}

const labels = (issue) => (issue.labels?.nodes ?? []).map((l) => l.name);
const children = (issue) => issue.subIssues?.nodes ?? [];
const childCount = (issue) => issue.subIssues?.totalCount ?? children(issue).length;
const isOpen = (issue) => issue.state === "OPEN";
// 要求の雛形の「種別」の欄。GitHub の form は見出しの次の行に値を、GitLab の雛形は残した箇条書きを置く
const kindOf = (issue) => /^#{2,3} 種別[ \t]*\n+[ \t]*(?:- )?([a-z][a-z0-9-]*)[ \t]*$/m.exec((issue.body ?? "").replaceAll("\r\n", "\n"))?.[1];
// 種別が分からない要求は、検証のタスクが要るかを決められないので、要るものとして扱う
const needsVerify = (issue) => {
  const preset = presets[kindOf(issue)];
  return !preset || !Array.isArray(preset.tasks) || preset.tasks.includes("verify");
};

const checks = [
  ["子が全て閉じて、開いたままの親", (i) => isOpen(i) && childCount(i) > 0 && children(i).every((c) => !isOpen(c))],
  // 閉じた親は直す対象ではないので、子の数を数えない
  [`子が ${maxChildren} 件を超えた開いた親`, (i) => isOpen(i) && childCount(i) > maxChildren],
  ["親が閉じて、開いたままの子", (i) => isOpen(i) && i.parent?.state === "CLOSED"],
  ["type: のラベルがない issue", (i) => !labels(i).some((l) => l.startsWith("type:"))],
  [
    "子を持つのに、type:verify の子がない開いた要求",
    (i) => isOpen(i) && labels(i).includes("type:requirements") && childCount(i) > 0 && needsVerify(i) && !children(i).some((c) => labels(c).includes("type:verify")),
  ],
];

let found = 0;
for (const [name, match] of checks) {
  const hits = issues.filter(match).sort((a, b) => a.number - b.number);
  if (hits.length === 0) continue;
  found += hits.length;
  console.log(`${name}: ${hits.length} 件`);
  for (const i of hits) console.log(`  #${i.number} ${i.title}${childCount(i) > 0 ? `（子 ${childCount(i)} 件）` : ""}`);
}
if (found === 0) console.log(`OK: ${issues.length} 件の issue に、合わないものはない`);
process.exit(found === 0 ? 0 : 1);

// 利用者のリポジトリに YAML のライブラリがあるとは限らないので、process.presets の種別ごとの tasks だけを行の字下げで読む。
// tasks は、行の中の列（[design, impl]）と、「- 」の列の両方を読む。読めなかった tasks（アンカーなど）は持たず、検証のタスクが要るものとして扱う
function readPresets(text) {
  const result = {};
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+#.*$/, ""));
  const indent = (l) => l.length - l.trimStart().length;
  let inProcess = false;
  let presetsIndent = -1;
  let kind;
  let kindIndent = -1;
  let tasksIndent = -1;
  for (const line of lines) {
    if (!line.trim()) continue;
    const n = indent(line);
    const t = line.trim();
    if (n === 0) {
      inProcess = t === "process:";
      presetsIndent = -1;
      kind = undefined;
      continue;
    }
    if (!inProcess) continue;
    if (presetsIndent < 0) {
      if (t === "presets:") presetsIndent = n;
      continue;
    }
    if (n <= presetsIndent) {
      presetsIndent = t === "presets:" ? n : -1;
      kind = undefined;
      continue;
    }
    if (tasksIndent >= 0 && n >= tasksIndent && t.startsWith("- ")) {
      (result[kind].tasks ??= []).push(t.slice(2).trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    tasksIndent = -1;
    const key = /^([a-z][a-z0-9-]*):\s*(.*)$/.exec(t);
    if (!key) continue;
    if (kind === undefined || n <= kindIndent) {
      kind = key[1];
      kindIndent = n;
      result[kind] = {};
      continue;
    }
    if (key[1] !== "tasks") continue;
    const inline = /^\[(.*)\]$/.exec(key[2]);
    if (inline) result[kind].tasks = inline[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    else if (key[2] === "") tasksIndent = n;
  }
  return result;
}

function currentRepo() {
  return execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { encoding: "utf8" }).trim();
}

// 子は 100 件まで読む。上限の判定は totalCount で数えるが、101 件目からの子の開閉と type:verify は判定に入らない
function fetchIssues(repo) {
  const [owner, name] = repo.split("/");
  const query = `query($owner: String!, $name: String!, $endCursor: String) {
    repository(owner: $owner, name: $name) {
      issues(first: 50, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number title state body
          labels(first: 50) { nodes { name } }
          parent { number state }
          subIssues(first: 100) { totalCount nodes { number state labels(first: 50) { nodes { name } } } }
        }
      }
    }
  }`;
  const out = execFileSync(
    "gh",
    ["api", "graphql", "--paginate", "-f", `query=${query}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "--jq", ".data.repository.issues.nodes[]"],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  return out.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
