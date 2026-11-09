/**
 * 画面仕様書の表示と活性の条件の文と、api.md の条件の対応と要素の testid の表を照らす。
 * check-screens.mjs が使う。規則は docs/screens/rules.md の「表示と活性」と「API との対応」にある。
 * agent-harness のパッケージ screens の check-screens.mjs の同じ確認を写したもの。
 */

const CONDITION_HEADER = ['条件', '判定に使う値']
const TESTID_TABLE_HEADER = ['番号', '要素名', 'testid']

/** 条件の文を照らす形にする。HTML のコメント、前後の空白、末尾の句点を外す */
export const normalizeCondition = (text) =>
  text
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
    .replace(/。$/, '')
    .replace(/\s+/g, ' ')

/** 否定の文の末尾を、api.md に書く否定でない形に置き換える */
export const affirmative = (text) => text.replace(/でない$/, 'である').replace(/がない$/, 'がある')

/** index.md の「**表示**」「**活性**」の下の条件の文を、行の番号と一緒に返す。コードブロックの中は読まない */
export const readConditions = (markdown) => {
  const conditions = []
  let label = null
  let anyOf = false
  let anyOfIndent = null
  let fence = null
  markdown.split(/\r?\n/).forEach((line, index) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence !== null) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
      return
    }
    if (marker) {
      fence = marker[1]
      label = null
      return
    }
    const field = line.match(/^\*\*(表示|活性)\*\*:/)
    if (field) {
      label = field[1]
      anyOf = false
      return
    }
    if (label === null || line.trim() === '' || /^\s*<!--[\s\S]*-->\s*$/.test(line)) return
    const item = line.match(/^(\s*)[-*] (.*)$/)
    if (!item) {
      label = null
      return
    }
    const indent = item[1].length
    const text = normalizeCondition(item[2])
    if (indent === 0) {
      anyOf = text === '次のどれかに当てはまる'
      anyOfIndent = null
      if (!anyOf && text !== '') conditions.push({ label, text, line: index + 1 })
      return
    }
    // 「次のどれかに当てはまる」の下の第 2 段だけが条件で、ほかの入れ子は理由の文
    if (!anyOf) return
    anyOfIndent ??= indent
    if (indent === anyOfIndent && text !== '') conditions.push({ label, text, line: index + 1 })
  })
  return conditions
}

/** `## <見出し>` の下の表を返す。見出しが無ければ null。表の見出しの行は header に入れる */
export const readTable = (markdown, heading) => {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`)
  if (start === -1) return null
  const table = { header: null, rows: [] }
  for (let i = start + 1; i < lines.length && !/^#{1,2} /.test(lines[i]); i++) {
    if (!lines[i].startsWith('|')) continue
    const cells = lines[i]
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((c) => c.replace(/<!--[\s\S]*?-->/g, '').trim())
    if (table.header === null) table.header = cells
    else if (!cells.every((c) => /^:?-+:?$/.test(c))) table.rows.push({ cells, line: i + 1 })
  }
  return table
}

/** モックの開始タグのうち、data-m と data-testid を同じ要素に持つものの「番号\ttestid」の組を返す */
export const readTestIdPairs = (html) => {
  const pairs = new Set()
  for (const tag of html.matchAll(/<[a-z][^>]*>/g)) {
    const m = tag[0].match(/\sdata-m=(["'])([^"']*)\1/)?.[2]
    const id = tag[0].match(/\sdata-testid=(["'])([^"']*)\1/)?.[2]
    if (m !== undefined && id !== undefined) pairs.add(`${m}\t${id}`)
  }
  return pairs
}

/**
 * index.md の条件の文が api.md の条件の対応の表にあるかと、要素の testid の表の組がモックにあるかを見る。
 * 違反を { path: 'spec' | 'api', message } の配列で返す。
 */
export const checkApiTables = (markdown, apiMarkdown, pairs) => {
  const problems = []
  const conditionTable = readTable(apiMarkdown, '条件の対応')
  if (conditionTable?.header != null && conditionTable.header.join() !== CONDITION_HEADER.join())
    problems.push({
      path: 'api',
      message: `条件の対応の表の見出しを ${CONDITION_HEADER.join(' | ')} にする`,
    })
  const known = new Set(
    (conditionTable?.rows ?? []).map((r) => normalizeCondition(r.cells[0] ?? '')),
  )
  for (const c of readConditions(markdown)) {
    if (!known.has(affirmative(c.text)))
      problems.push({
        path: 'spec',
        message: `「${c.label}」の条件「${c.text}」が api.md の条件の対応の表に無い（${c.line} 行目）`,
      })
  }

  const testIdTable = readTable(apiMarkdown, '要素の testid')
  if (testIdTable === null) return problems
  if (testIdTable.header?.join() !== TESTID_TABLE_HEADER.join())
    problems.push({
      path: 'api',
      message: `要素の testid の表の見出しを ${TESTID_TABLE_HEADER.join(' | ')} にする`,
    })
  for (const { cells, line } of testIdTable.rows) {
    const [number, name, raw] = cells
    const testId = (raw ?? '').replace(/^`(.*)`$/, '$1')
    if (!number || !testId) continue
    if (!pairs.has(`${number}\t${testId}`))
      problems.push({
        path: 'api',
        message: `要素の testid の ${number} の「${name}」の ${testId} が、モックの data-m="${number}" の要素の data-testid に無い（${line} 行目）`,
      })
  }
  return problems
}
