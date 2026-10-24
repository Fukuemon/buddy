#!/usr/bin/env node
// context/project.yml の docs_site.parts に並べたもの（文書のサイト、カタログ、図のビルドの出力）を、1 つの出力のディレクトリのサブパスに並べる。
// リポジトリのルートで実行する。出力のディレクトリは、Git で追跡しない、組み立ての出力だけのディレクトリにする。並べる前に消す。
// 使い方: node scripts/build-docs-site.mjs --out <出力のディレクトリ> [--build] [--project <project.yml>]
//   --build を付けると、並べる前に各 part の build のコマンドをリポジトリのルートで実行する。
// 終了コード: 0 は並べた、1 は値か --out の誤りか並べるものがない、2 は値のファイルが読めないか読めない形か build のコマンドが失敗した
import { cpSync, existsSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { FormError, isRelativePath, nested, readDocsSiteConfig, validateDocsSite } from "./read-docs-site-config.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) fail(1, `${name} に値を渡す`);
  return value;
};
const root = process.cwd();
const outArg = option("--out");
const projectPath = resolve(root, option("--project") ?? "context/project.yml");

if (!outArg) fail(1, "--out に出力のディレクトリを渡す");
if (!isRelativePath(outArg) || outArg.split("/").includes(".git")) fail(1, `--out はリポジトリの中の相対パスで書き、.git を含めない: ${outArg}`);
// 重なりと追跡の確認はパスの文字列で行うので、シンボリックリンクをたどる出力先は拒む
const segments = outArg.split("/");
for (let i = 1; i <= segments.length; i++) {
  const prefix = segments.slice(0, i).join("/");
  if (lstatSync(join(root, prefix), { throwIfNoEntry: false })?.isSymbolicLink()) fail(1, `--out の ${prefix} がシンボリックリンクである。リンクをたどらないパスにする`);
}

let config;
try {
  config = readDocsSiteConfig(readFileSync(projectPath, "utf8"));
} catch (e) {
  fail(2, e instanceof FormError ? e.message : `読めない: ${projectPath}\n${e.message}`);
}

const errors = validateDocsSite(config);
if (!errors.length) {
  for (const p of config.parts) if (nested(p.path, outArg) || nested(outArg, p.path)) errors.push(`${p.path}: --out の ${outArg} と重なる。出力のディレクトリは並べる前に消す`);
}
if (errors.length) fail(1, `docs_site が不正: ${projectPath}\n${errors.map((e) => `  ${e}`).join("\n")}`);

let tracked;
try {
  tracked = execFileSync("git", ["ls-files", "--", outArg], { cwd: root, encoding: "utf8" }).trim();
} catch (e) {
  fail(2, `Git のリポジトリのルートで実行する: ${e.message}`);
}
if (tracked) fail(1, `--out の ${outArg} に Git で追跡しているファイルがある。組み立ての出力だけのディレクトリにする`);

const parts = config.parts;
if (args.includes("--build")) {
  for (const part of parts.filter((p) => p.build)) {
    console.log(`> ${part.build}`);
    try {
      execSync(part.build, { cwd: root, stdio: "inherit" });
    } catch {
      fail(2, `build のコマンドが失敗した: ${part.build}`);
    }
  }
}

const missing = parts.filter((p) => !existsSync(join(root, p.path)));
if (missing.length) {
  fail(1, missing.map((p) => `${p.path} がない。${p.build ? `先に ${p.build} を実行する` : "先にビルドの出力を作る"}`).join("\n"));
}

const out = join(root, outArg);
rmSync(out, { recursive: true, force: true });
for (const { path, subpath, exclude = [] } of parts) {
  const source = join(root, path);
  try {
    cpSync(source, join(out, subpath), {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: (src) => src === source || !exclude.includes(basename(src)),
    });
  } catch (e) {
    fail(1, `${path} を /${subpath} に写せない。ほかの part の出力とファイルがぶつかる: ${e.message}`);
  }
}
console.log(`${outArg} に並べた:\n${parts.map((p) => `  /${p.subpath ? `${p.subpath}/` : ""} <- ${p.path}`).join("\n")}`);

function fail(code, message) {
  console.error(message);
  process.exit(code);
}
