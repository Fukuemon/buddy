// 測った値を、故障ごとの表にして Markdown のファイルに書き足す。ファイルは Git で追跡しない。
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CallResult } from './tokens'

const RESULTS_DIR = fileURLToPath(new URL('../results', import.meta.url))

/** 1 回の実行の結果のファイル。run.sh が FAULTS_RUN_ID に実行の時刻を渡す。 */
const RESULTS_FILE = path.join(
  RESULTS_DIR,
  `${process.env.FAULTS_RUN_ID ?? new Date().toISOString().replaceAll(':', '-')}.md`,
)

/**
 * 1 行の観点。basis は比べる元で、#877 は docs/verification/877-token-hook-failures/README.md、
 * ADR は ADR-0044 と context/operations.md の Login and Token Failures、記録だけは期待で判定しない値である。
 */
export type Row = { label: string; value: string; basis: '#877' | 'ADR' | '記録だけ' }

/** 故障 title の観点の表を、結果のファイルに書き足す。 */
export const report = (title: string, rows: Row[]) => {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const lines = [
    `## ${title}`,
    '',
    '| 観点 | 測った値 | 比べる元 |',
    '| --- | --- | --- |',
    ...rows.map((r) => `| ${r.label} | ${r.value.replaceAll('|', '\\|')} | ${r.basis} |`),
    '',
  ]
  appendFileSync(RESULTS_FILE, `${lines.join('\n')}\n`)
}

/** 呼び出しの結果を、表のセルの文にする。 */
export const formatCall = (r: CallResult) =>
  r.status === null
    ? `答えが無いまま切れた（${r.seconds} 秒、${r.failure ?? ''}）`
    : `${r.status}${r.error ? ` \`${r.error}\`` : ''}（${r.seconds} 秒）`
