// 実行: node --test scripts/screen-conditions.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkApiTables, readConditions, readTestIdPairs } from './screen-conditions.mjs'

const SPEC = `# order-list 注文の一覧

## 注文する

**概要**: 注文を作るボタン。

**表示**: 次の全てに当てはまるとき。

- 開いた注文が、キャンセルした注文でない
  - キャンセルした注文は変えられないためである。
- 次のどれかに当てはまる
  - ログインした職員が、注文を作れる
  - ログインした職員が、管理者である

**活性**: 次の全てに当てはまるとき。

- 開いた注文に、未払いの請求がない

\`\`\`markdown
**表示**: 次の全てに当てはまるとき。

- コードブロックの中の条件
\`\`\`
`

const ALL_CONDITIONS = [
  '開いた注文が、キャンセルした注文である',
  'ログインした職員が、注文を作れる',
  'ログインした職員が、管理者である',
  '開いた注文に、未払いの請求がある',
]

const api = ({ conditions = ALL_CONDITIONS, testIds = [] } = {}) => `# order-list API との対応

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
${conditions.map((c) => `| ${c} | \`Order.x\` |`).join('\n')}

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
${testIds.map(([n, id]) => `| ${n} | 注文する | \`${id}\` |`).join('\n')}
`

const PAIRS = readTestIdPairs(
  '<button type="button" data-m="1" data-testid="order-list-submit">注文する</button><span data-testid="order-list-x"></span>',
)

test('第 1 段の文と、「次のどれかに当てはまる」の下の第 2 段の文だけを条件として読む', () => {
  assert.deepEqual(
    readConditions(SPEC).map((c) => `${c.label}:${c.text}`),
    [
      '表示:開いた注文が、キャンセルした注文でない',
      '表示:ログインした職員が、注文を作れる',
      '表示:ログインした職員が、管理者である',
      '活性:開いた注文に、未払いの請求がない',
    ],
  )
})

test('条件の文が条件の対応の表にあれば、否定の文も含めて違反にしない', () => {
  assert.deepEqual(checkApiTables(SPEC, api({ testIds: [['1', 'order-list-submit']] }), PAIRS), [])
})

test('条件の対応の表に無い条件の文を報告する', () => {
  const problems = checkApiTables(SPEC, api({ conditions: ALL_CONDITIONS.slice(0, 2) }), PAIRS)
  assert.deepEqual(
    problems.map((p) => p.path),
    ['spec', 'spec'],
  )
  assert.match(problems[0].message, /「表示」の条件「ログインした職員が、管理者である」が api.md/)
  assert.match(problems[1].message, /「活性」の条件「開いた注文に、未払いの請求がない」が api.md/)
})

test('否定の文を否定のまま表に書くと、照らさない', () => {
  const conditions = ['開いた注文が、キャンセルした注文でない', ...ALL_CONDITIONS.slice(1)]
  const problems = checkApiTables(SPEC, api({ conditions }), PAIRS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /「開いた注文が、キャンセルした注文でない」が api.md/)
})

test('testid が、モックの同じ番号の要素に無いと報告する', () => {
  for (const testIds of [[['1', 'order-list-x']], [['2', 'order-list-submit']]]) {
    const problems = checkApiTables(SPEC, api({ testIds }), PAIRS)
    assert.equal(problems.length, 1, JSON.stringify(problems))
    assert.equal(problems[0].path, 'api')
  }
})

test('表の見出しが規約と違うと報告する', () => {
  const md =
    '## 条件の対応\n\n| 条件 | 値 |\n| --- | --- |\n\n## 要素の testid\n\n| 番号 | testid |\n| --- | --- |\n'
  const messages = checkApiTables('', md, PAIRS).map((p) => p.message)
  assert.deepEqual(messages, [
    '条件の対応の表の見出しを 条件 | 判定に使う値 にする',
    '要素の testid の表の見出しを 番号 | 要素名 | testid にする',
  ])
})

test('今の形の仕様書（活性条件と表示条件の欄、表の無い api.md）には違反を出さない', () => {
  const old = '## 注文する\n\n**活性条件**: 常に活性\n\n**表示条件**: 注文があるとき\n'
  assert.deepEqual(checkApiTables(old, '# order-list API との対応\n', PAIRS), [])
})
