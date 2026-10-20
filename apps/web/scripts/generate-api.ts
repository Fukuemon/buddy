/**
 * 予定の API と照合の API の openapi.yaml から、画面の型を src/api/generated/ に生成する。
 * `format: binary` の項目は、ブラウザから送る値に合わせて Blob にする。
 *
 * 使い方: `pnpm --filter @buddy/web generate:api`
 */
import { writeFile } from 'node:fs/promises'

import openapiTS, { COMMENT_HEADER, astToString } from 'openapi-typescript'
import ts from 'typescript'

const BLOB = ts.factory.createTypeReferenceNode('Blob')

const targets = [
  { from: '../schedule-api/openapi.yaml', to: 'src/api/generated/schedule.ts' },
  { from: '../receipt-api/openapi.yaml', to: 'src/api/generated/receipt.ts' },
]

for (const { from, to } of targets) {
  const ast = await openapiTS(new URL(from, `file://${process.cwd()}/`), {
    transform: (schema) => (schema.format === 'binary' ? BLOB : undefined),
  })
  await writeFile(to, COMMENT_HEADER + astToString(ast))
  console.log(`${from} → ${to}`)
}
