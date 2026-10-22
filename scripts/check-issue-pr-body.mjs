#!/usr/bin/env node
/**
 * pull request と issue のタイトルと本文の形を、スキル write-issue-pr と CONTRIBUTING.md の「issue と pull request」の規則で確かめる。
 * GitHub Actions の issue-pr-body.yml が、イベントの JSON（GITHUB_EVENT_PATH）を渡して流す。
 *
 * pull request は、違反があれば終了コード 1 で終わる。issue は、違反を 1 つのコメントで知らせ、直ったらそのコメントを消す。
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
const AI_OUT = /(^|[\s(`'"/])\.?\/?\.ai-out\//m
const SKIP_AUTHORS = new Set(['dependabot[bot]'])
const MARKER = '<!-- issue-pr-body-check -->'

// HTML のコメントとコードブロックは、テンプレートの説明と例なので、見出しと参照の確かめから外す
export function stripNonText(body) {
  return body.replace(/<!--[\s\S]*?-->/g, '').replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
}

export function checkTitle(title) {
  return PREFIX.test(title)
    ? []
    : ['タイトルが【要求】【設計】【実装】【検証】【文書】【不具合】のどれかで始まっていない']
}

export function checkCommon(body) {
  const errors = []
  if (ATTRIBUTION.some((re) => re.test(body))) {
    errors.push('本文に、コーディングエージェントの生成の行かセッションの URL がある')
  }
  // インラインのコードの `.ai-out/` は、ディレクトリそのものを話題にした書き方なので外す
  if (AI_OUT.test(stripNonText(body).replace(/`[^`\n]+`/g, ''))) {
    errors.push('本文に `.ai-out/` のパスが残っている。添付を済ませるか、内容を本文に書く')
  }
  return errors
}

export function linkedIssue(body) {
  const first = body.split('\n').find((line) => line.trim() !== '') ?? ''
  const m = first.trim().match(LINK_LINE)
  return m ? { keyword: m[1], number: Number(m[2]) } : null
}

export function checkSections(body) {
  const headings = [...stripNonText(body).matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1])
  const expected = SECTIONS.filter((s) => !OPTIONAL_SECTIONS.has(s) || headings.includes(s))
  if (headings.join('\n') === expected.join('\n')) return []
  return [
    `節の名前か順がテンプレートと違う。期待: ${expected.join('、')}。実際: ${headings.join('、') || 'なし'}`,
  ]
}

export function checkPullRequestTitle(title, issueTitle) {
  if (issueTitle === null || title === issueTitle) return []
  if (title.startsWith(`${issueTitle}（`) && title.endsWith('）')) return []
  return [`タイトルが issue のタイトル「${issueTitle}」と違う。分けたときは末尾に「（n/m 内容）」を付ける`]
}

export function checkPullRequest({ number, title, body, issueTitle }) {
  const errors = [...checkTitle(title), ...checkCommon(body), ...checkSections(body)]
  const link = linkedIssue(body)
  if (!link) {
    errors.push('本文の先頭の行が `Closes #<番号>` か `Refs #<番号>` ではない')
  } else {
    errors.push(...checkPullRequestTitle(title, issueTitle))
  }
  const warnings = []
  if (new RegExp(`/pull/${number}#issuecomment-`).test(body)) {
    warnings.push(
      '本文が、この pull request のコメントを指している。エビデンスはコメントではなく「検証とエビデンス」に載せる',
    )
  }
  return { errors, warnings }
}

export function checkIssue({ title, body }) {
  return { errors: [...checkTitle(title), ...checkCommon(body)], warnings: [] }
}

function textlint(body) {
  const dir = mkdtempSync(join(tmpdir(), 'issue-pr-body-'))
  const file = join(dir, 'body.md')
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
    return (error.stdout ?? '')
      .split('\n')
      .filter((line) => line.startsWith(file))
      .map((line) => `textlint: ${line.slice(file.length + 1)}`)
  }
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status}`)
  return res.status === 204 ? null : res.json()
}

async function issueTitleOf(number) {
  try {
    return (await api(`/issues/${number}`)).title
  } catch {
    return null
  }
}

function report({ errors, warnings }) {
  return [
    ...errors.map((e) => `- ${e}`),
    ...warnings.map((w) => `- （注意）${w}`),
  ].join('\n')
}

async function syncIssueComment(number, text) {
  const comments = await api(`/issues/${number}/comments?per_page=100`)
  const mine = comments.find(
    (c) => c.user.login === 'github-actions[bot]' && c.body.startsWith(MARKER),
  )
  if (!text) {
    if (mine) await api(`/issues/comments/${mine.id}`, { method: 'DELETE' })
    return
  }
  const body = `${MARKER}\nタイトルと本文の形の確かめで、次の点が見つかった。規則は CONTRIBUTING.md の「issue と pull request」とスキル write-issue-pr にある。\n\n${text}`
  if (mine) {
    await api(`/issues/comments/${mine.id}`, { method: 'PATCH', body: JSON.stringify({ body }) })
  } else {
    await api(`/issues/${number}/comments`, { method: 'POST', body: JSON.stringify({ body }) })
  }
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const target = event.pull_request ?? event.issue
  if (SKIP_AUTHORS.has(target.user.login)) return 0
  const body = target.body ?? ''
  let result
  if (event.pull_request) {
    const link = linkedIssue(body)
    const issueTitle = link ? await issueTitleOf(link.number) : null
    result = checkPullRequest({ number: target.number, title: target.title, body, issueTitle })
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
