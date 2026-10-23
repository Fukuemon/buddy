import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkIssue,
  checkPullRequest,
  linkedIssue,
  parseTextlint,
  stripNonText,
} from './check-issue-pr-body.mjs'

const REPO = 'Fukuemon/buddy'
const ISSUE_TITLE = '【実装】リンクのチェックを追加する'
const SECTIONS = ['概要', '対応内容', '背景', '確認したこと', '影響', 'レビューしてほしい点', '残したこと']

function body({ first = 'Closes #12', sections = SECTIONS, extra = '' } = {}) {
  return [first, '', ...sections.flatMap((s) => [`## ${s}`, '', 'なし', '']), extra].join('\n')
}

function pr(overrides = {}) {
  return checkPullRequest({
    repo: REPO,
    number: 30,
    title: ISSUE_TITLE,
    body: body(),
    issueTitle: ISSUE_TITLE,
    ...overrides,
  })
}

test('テンプレートどおりの pull request は指摘なしになる', () => {
  assert.deepEqual(pr(), { errors: [], warnings: [] })
})

test('検証とエビデンスのセクションは、あってもなくても通り、位置が違えば指摘する', () => {
  const at = (i) => [...SECTIONS.slice(0, i), '検証とエビデンス', ...SECTIONS.slice(i)]
  assert.deepEqual(pr({ body: body({ sections: at(4) }) }).errors, [])
  assert.match(pr({ body: body({ sections: at(1) }) }).errors[0], /セクションの名前か順/)
})

test('接頭辞の無いタイトルを指摘する', () => {
  const title = 'feat: リンクのチェックを追加する'
  const { errors } = pr({ title, issueTitle: title })
  assert.deepEqual(errors, ['タイトルが【要求】【設計】【実装】【検証】【文書】【不具合】のどれかで始まっていない'])
})

test('issue のタイトルと違うタイトルを指摘し、分けたときの付け足しは通す', () => {
  assert.match(pr({ title: '【実装】リンクを確認する' }).errors[0], /issue のタイトル/)
  assert.match(pr({ title: `${ISSUE_TITLE}（なんでも）` }).errors[0], /issue のタイトル/)
  assert.deepEqual(pr({ title: `${ISSUE_TITLE}（1/2 スクリプト）` }).errors, [])
  assert.deepEqual(pr({ title: `${ISSUE_TITLE}（3 ワークフロー）` }).errors, [])
})

test('先頭の行が Closes か Refs でなければ指摘し、リンク先の issue が無ければ指摘する', () => {
  assert.match(pr({ body: body({ first: 'issue #12 の対応' }) }).errors[0], /先頭の行が `Closes/)
  assert.match(pr({ body: body({ first: 'Closes #' }) }).errors[0], /先頭の行が `Closes/)
  assert.match(pr({ issueTitle: null }).errors[0], /#12 の issue が無い/)
  assert.deepEqual(linkedIssue(body({ first: 'Refs #7' })), { keyword: 'Refs', number: 7 })
})

test('セクションの欠け、足し、順の違いを指摘する', () => {
  for (const sections of [
    SECTIONS.slice(0, -1),
    [...SECTIONS, '表の指摘ごとの対応'],
    ['対応内容', '概要', ...SECTIONS.slice(2)],
  ]) {
    assert.match(pr({ body: body({ sections }) }).errors[0], /セクションの名前か順/)
  }
})

test('生成の行、セッションの URL、.ai-out のパスを指摘する', () => {
  for (const extra of [
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    'https://claude.ai/code/session_01ABC',
  ]) {
    assert.deepEqual(pr({ body: body({ extra }) }).errors, [
      '本文に、コーディングエージェントの生成の行かセッションの URL がある',
    ])
  }
  for (const extra of [
    '![動画](./.ai-out/evidence/30/a.mp4)',
    '動画は（.ai-out/evidence/a.mp4）にある',
    '動画は.ai-out/evidence/a.mp4にある',
    '「.ai-out/x.md」',
  ]) {
    assert.match(pr({ body: body({ extra }) }).errors[0], /`\.ai-out\/` のパスが残っている/, extra)
  }
})

test('コメント、コードブロック、details の中の見出しと .ai-out は見ない', () => {
  for (const extra of [
    '<!--\n## 例\n./.ai-out/evidence/a.mp4\n-->',
    '```md\n## 例\n```',
    '````md\n```js\nx\n```\n## 例\n````',
    '- 手順\n\n   ```sh\n   ls .ai-out/\n   ```',
    '<details><summary>spec</summary>\n\n## 例\n\n</details>',
  ]) {
    assert.deepEqual(pr({ body: body({ extra }) }).errors, [], extra)
  }
  assert.equal(stripNonText('````md\n```js\nx\n```\n````').trim(), '')
})

test('インラインのコードの .ai-out は話題として通す', () => {
  const extra = '`recordPrEvidence` が `.ai-out/evidence/<番号>/` に書き出す。'
  assert.deepEqual(pr({ body: body({ extra }) }).errors, [])
})

test('この pull request のコメントを指すリンクは注意にとどめ、ほかのリポジトリは見ない', () => {
  const own = pr({ body: body({ extra: `https://github.com/${REPO}/pull/30#issuecomment-1` }) })
  assert.deepEqual(own.errors, [])
  assert.equal(own.warnings.length, 1)
  const other = pr({ body: body({ extra: 'https://github.com/x/y/pull/30#issuecomment-1' }) })
  assert.deepEqual(other.warnings, [])
})

test('issue は接頭辞、帰属表示、.ai-out のパスだけを見る', () => {
  assert.deepEqual(checkIssue({ title: ISSUE_TITLE, body: '### 背景\n\nなし' }).errors, [])
  assert.deepEqual(checkIssue({ title: 'リンクのチェック', body: 'see .ai-out/x.md' }).errors, [
    'タイトルが【要求】【設計】【実装】【検証】【文書】【不具合】のどれかで始まっていない',
    '本文に `.ai-out/` のパスが残っている。添付を済ませるか、内容を本文に書く',
  ])
})

test('textlint の unix 形式の出力から、本文の指摘だけを拾う', () => {
  const file = '/tmp/x/body.md'
  const output = `${file}:1:1: 証跡 => エビデンス\n確認したことの記録 [Error/prh]\n\n1 problem\n`
  assert.deepEqual(parseTextlint(output, file), ['textlint: 1:1: 証跡 => エビデンス'])
  assert.deepEqual(parseTextlint('No rules found\n', file), [])
})
