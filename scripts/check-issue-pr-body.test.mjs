import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkIssue, checkPullRequest, linkedIssue, stripNonText } from './check-issue-pr-body.mjs'

const ISSUE_TITLE = '【実装】リンクのチェックを追加する'
const SECTIONS = ['概要', '対応内容', '背景', '確認したこと', '影響', 'レビューしてほしい点', '残したこと']

function body({ first = 'Closes #12', sections = SECTIONS, extra = '' } = {}) {
  return [first, '', ...sections.flatMap((s) => [`## ${s}`, '', 'なし', '']), extra].join('\n')
}

function pr(overrides = {}) {
  return checkPullRequest({ number: 30, title: ISSUE_TITLE, body: body(), issueTitle: ISSUE_TITLE, ...overrides })
}

test('テンプレートどおりの pull request は指摘なしになる', () => {
  assert.deepEqual(pr(), { errors: [], warnings: [] })
})

test('検証とエビデンスの節は、あってもなくても通る', () => {
  const sections = [...SECTIONS.slice(0, 4), '検証とエビデンス', ...SECTIONS.slice(4)]
  assert.deepEqual(pr({ body: body({ sections }) }).errors, [])
})

test('接頭辞の無いタイトルを指摘する', () => {
  const { errors } = pr({ title: 'feat: リンクのチェックを追加する', issueTitle: null })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /タイトルが【要求】/)
})

test('issue のタイトルと違うタイトルを指摘し、分けたときの付け足しは通す', () => {
  assert.match(pr({ title: '【実装】リンクを確かめる' }).errors[0], /issue のタイトル/)
  assert.deepEqual(pr({ title: `${ISSUE_TITLE}（1/2 スクリプト）` }).errors, [])
})

test('先頭の行が Closes か Refs でなければ指摘する', () => {
  assert.match(pr({ body: body({ first: 'issue #12 の対応' }) }).errors[0], /先頭の行/)
  assert.deepEqual(linkedIssue(body({ first: 'Refs #7' })), { keyword: 'Refs', number: 7 })
})

test('節の欠け、足し、順の違いを指摘する', () => {
  for (const sections of [
    SECTIONS.slice(0, -1),
    [...SECTIONS, '表の指摘ごとの対応'],
    ['対応内容', '概要', ...SECTIONS.slice(2)],
  ]) {
    assert.match(pr({ body: body({ sections }) }).errors[0], /節の名前か順/)
  }
})

test('帰属表示と .ai-out のパスを指摘する', () => {
  const extra = '🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\n![動画](./.ai-out/evidence/30/a.mp4)'
  const { errors } = pr({ body: body({ extra }) })
  assert.equal(errors.length, 2)
})

test('HTML のコメントとコードブロックの中の見出しと .ai-out は見ない', () => {
  const extra = '<!--\n## 例\n./.ai-out/evidence/a.mp4\n-->\n\n```md\n## 例\n```\n'
  assert.deepEqual(pr({ body: body({ extra }) }).errors, [])
  assert.equal(stripNonText(extra).includes('## 例'), false)
})

test('インラインのコードの .ai-out は話題として通す', () => {
  const extra = '`recordPrEvidence` が `.ai-out/evidence/<番号>/` に書き出す。'
  assert.deepEqual(pr({ body: body({ extra }) }).errors, [])
})

test('自分のコメントを指すリンクは注意にとどめる', () => {
  const extra = 'https://github.com/Fukuemon/buddy/pull/30#issuecomment-1'
  const result = pr({ body: body({ extra }) })
  assert.deepEqual(result.errors, [])
  assert.equal(result.warnings.length, 1)
})

test('issue は接頭辞、帰属表示、.ai-out のパスだけを見る', () => {
  assert.deepEqual(checkIssue({ title: ISSUE_TITLE, body: '### 背景\n\nなし' }).errors, [])
  assert.equal(checkIssue({ title: 'リンクのチェック', body: 'see .ai-out/x.md' }).errors.length, 2)
})
