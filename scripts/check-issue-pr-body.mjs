#!/usr/bin/env node
/**
 * pull request と issue のタイトルと本文の形を、スキル write-issue-pr と CONTRIBUTING.md の「issue と pull request」の規則で確かめる。
 * GitHub Actions の issue-pr-body.yml が、イベントの JSON（GITHUB_EVENT_PATH）を渡して流す。
 *
 * pull request は、違反があれば終了コード 1 で終わる。issue は、違反を 1 つのコメントで知らせ、直ったらそのコメントを消す。
 * textlint が動かないときと、GitHub の API が 404 以外で失敗したときは、例外で止まる。
 *
 * 使い方: node scripts/check-issue-pr-body.mjs
 * 環境変数: GITHUB_EVENT_PATH、GITHUB_REPOSITORY、GITHUB_TOKEN、GITHUB_STEP_SUMMARY（任意）
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PREFIX = /^【(要求|設計|実装|検証|文書|不具合)】/
const LINK_LINE = /^(Closes|Refs) #(\d+)\s*$/
const SECTIONS = [
  '概要',
  '対応内容',
  '背景',
  '確認したこと',
  '検証とエビデンス',
  '影響',
  'レビューしてほしい点',
  '残したこと',
]
const OPTIONAL_SECTIONS = new Set(['検証とエビデンス'])
const ATTRIBUTION = [/Generated with \[?Claude Code/, /https:\/\/claude\.ai\/code\/session_/]
const AI_OUT = /(^|[^\w.-])\.?\/?\.ai-out\//m
const SKIP_AUTHORS = new Set(['dependabot[bot]'])
const MARKER = '<!-- issue-pr-body-check -->'

/** HTML のコメント、コードブロック、details の中身を消した本文を返す。どれもテンプレートの説明か補足で、節ではない。 */
export function stripNonText(body) {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, '')
    .replace(/<details>[\s\S]*?<\/details>/g, '')
}

/** stripNonText に加えて、インラインのコードを消した本文を返す。インラインのコードの中のパスは、話題にした書き方である。 */
export function stripCode(body) {
  return stripNonText(body).replace(/`[^`\n]+`/g, '')
}

/** タイトルが接頭辞で始まらなければ、指摘の文を返す。 */
export function checkTitle(title) {
  return PREFIX.test(title)
    ? []
    : ['タイトルが【要求】【設計】【実装】【検証】【文書】【不具合】のどれかで始まっていない']
}

/** pull request と issue に共通する、帰属表示と `.ai-out/` のパスの指摘を返す。 */
export function checkCommon(body) {
  const errors = []
  if (ATTRIBUTION.some((re) => re.test(body))) {
    errors.push('本文に、コーディングエージェントの生成の行かセッションの URL がある')
  }
  if (AI_OUT.test(stripCode(body))) {
    errors.push('本文に `.ai-out/` のパスが残っている。添付を済ませるか、内容を本文に書く')
  }
  return errors
}

/** 本文の最初の空でない行が `Closes #n` か `Refs #n` なら、その種類と番号を返す。違えば null。 */
export function linkedIssue(body) {
  const first = body.split('\n').find((line) => line.trim() !== '') ?? ''
  const m = first.trim().match(LINK_LINE)
  return m ? { keyword: m[1], number: Number(m[2]) } : null
}

/** `##` の見出しが、テンプレートの節の名前と順に合わなければ、指摘の文を返す。検証とエビデンスは無くてもよい。 */
export function checkSections(body) {
  const headings = [...stripNonText(body).matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1])
  const expected = SECTIONS.filter((s) => !OPTIONAL_SECTIONS.has(s) || headings.includes(s))
  if (headings.join('\n') === expected.join('\n')) return []
  return [
    `節の名前か順がテンプレートと違う。期待: ${expected.join('、')}。実際: ${headings.join('、') || 'なし'}`,
  ]
}

/**
 * pull request のタイトルが issue のタイトルと違えば、指摘の文を返す。
 * 分けた pull request の、末尾の「（n/m 内容）」か「（n 内容）」の付け足しは通す。
 */
export function checkPullRequestTitle(title, issueTitle) {
  if (title === issueTitle) return []
  if (title.startsWith(`${issueTitle}（`) && /（\d+(\/\d+)? .+）$/.test(title)) return []
  return [
    `タイトルが issue のタイトル「${issueTitle}」と違う。分けたときは末尾に「（n/m 内容）」を付ける`,
  ]
}

/**
 * pull request の指摘を、errors（チェックを失敗にする）と warnings（知らせるだけ）に分けて返す。
 * issueTitle は、リンク先の issue のタイトル。issue が無ければ null。
 */
export function checkPullRequest({ repo, number, title, body, issueTitle }) {
  const errors = [...checkTitle(title), ...checkCommon(body), ...checkSections(body)]
  const link = linkedIssue(body)
  if (!link) {
    errors.push('本文の先頭の行が `Closes #<番号>` か `Refs #<番号>` ではない')
  } else if (issueTitle === null) {
    errors.push(`本文の先頭の行が指す #${link.number} の issue が無い`)
  } else {
    errors.push(...checkPullRequestTitle(title, issueTitle))
  }
  const warnings = []
  if (body.includes(`github.com/${repo}/pull/${number}#issuecomment-`)) {
    warnings.push(
      '本文が、この pull request のコメントを指している。エビデンスはコメントではなく「検証とエビデンス」に載せる',
    )
  }
  return { errors, warnings }
}

/** issue の指摘を返す。issue は form で書くので、節は確かめない。 */
export function checkIssue({ title, body }) {
  return { errors: [...checkTitle(title), ...checkCommon(body)], warnings: [] }
}

/** textlint の unix 形式の出力から、file の指摘を「行:列: 文」の形で返す。 */
export function parseTextlint(output, file) {
  return output
    .split('\n')
    .filter((line) => line.startsWith(`${file}:`))
    .map((line) => `textlint: ${line.slice(file.length + 1)}`)
}

function textlint(body) {
  const file = join(mkdtempSync(join(tmpdir(), 'issue-pr-body-')), 'body.md')
  writeFileSync(file, body)
  try {
    execFileSync(
      'pnpm',
      [
        'exec',
        'textlint',
        '--config',
        join(ROOT, '.textlintrc.json'),
        '--ignore-path',
        '/dev/null',
        '--format',
        'unix',
        file,
      ],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    return []
  } catch (error) {
    const found = parseTextlint(error.stdout ?? '', file)
    if (found.length === 0) {
      throw new Error(`textlint が終了コード ${error.status} で止まった: ${error.stderr ?? error.message}`)
    }
    return found
  }
}

function api(path, init = {}) {
  const url = path.startsWith('https://')
    ? path
    : `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`
  return fetch(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      ...init.headers,
    },
  })
}

async function send(path, method, body) {
  const res = await api(path, { method, body: body && JSON.stringify({ body }) })
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`)
  return res
}

async function issueTitleOf(number) {
  const res = await api(`/issues/${number}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET /issues/${number}: ${res.status}`)
  return (await res.json()).title
}

async function findMarkerComment(number) {
  let path = `/issues/${number}/comments?per_page=100`
  while (path) {
    const res = await send(path, 'GET')
    const mine = (await res.json()).find(
      (c) => c.user.login === 'github-actions[bot]' && c.body.startsWith(MARKER),
    )
    if (mine) return mine
    path = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1]
  }
  return null
}

async function syncIssueComment(number, text) {
  const mine = await findMarkerComment(number)
  if (!text) {
    if (mine) await send(`/issues/comments/${mine.id}`, 'DELETE')
    return
  }
  const body = `${MARKER}\nタイトルと本文の形の確かめで、次の点が見つかった。規則は CONTRIBUTING.md の「issue と pull request」とスキル write-issue-pr にある。\n\n${text}`
  if (mine) await send(`/issues/comments/${mine.id}`, 'PATCH', body)
  else await send(`/issues/${number}/comments`, 'POST', body)
}

function report({ errors, warnings }) {
  return [...errors.map((e) => `- ${e}`), ...warnings.map((w) => `- （注意）${w}`)].join('\n')
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const target = event.pull_request ?? event.issue
  if (SKIP_AUTHORS.has(target.user.login)) return 0
  const body = target.body ?? ''
  let result
  if (event.pull_request) {
    const link = linkedIssue(body)
    result = checkPullRequest({
      repo: process.env.GITHUB_REPOSITORY,
      number: target.number,
      title: target.title,
      body,
      issueTitle: link ? await issueTitleOf(link.number) : null,
    })
  } else {
    result = checkIssue({ title: target.title, body })
  }
  result.errors.push(...textlint(body))
  const text = report(result)
  if (text) console.error(text)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, text ? `${text}\n` : '指摘なし\n')
  }
  if (event.pull_request) return result.errors.length ? 1 : 0
  await syncIssueComment(target.number, text)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main()
}
