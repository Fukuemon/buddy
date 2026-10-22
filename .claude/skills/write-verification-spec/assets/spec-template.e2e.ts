// エビデンスを撮る spec のテンプレート。context/testing/evidence.md にある spec の配置先にコピーし、<…> を埋める。
// シナリオアウトラインでないシナリオは、CASES を消し、body の c を外してシナリオの文と操作を直に書き、recordEvidence に example を渡さない。
// context に kit を呼ぶ薄い層があれば、TARGET と VARIANTS をその層から import して置き換える。
import { test, type Page } from '@playwright/test'
import {
  recordEvidence,
  type Recording,
  type RecordingTarget,
} from '<packages/e2e/kit/recording への相対パス>/index.js'
import {
  evidenceDate,
  evidenceDir,
  variants,
  type Scenario,
} from '<packages/e2e/kit/evidence への相対パス>/index.js'

// <何を撮るか>。判定は、人が動画を見て行う。字幕の文はシナリオの文をコピーする
const SCENARIO: Scenario = {
  issue: '<要求の issue 番号>',
  id: '<@scenario-id>',
  actor: '<アクター>',
  // 配置先のフォルダの名前（<issue>/<アクター>/S<n>_<シナリオ名>/）になる。検証シナリオの pull request のエビデンスの名前と同じにする
  no: 0,
  title: '<シナリオ名>',
  // どのスクリーンショットにも映りうる、改修前と違ってよい差。<root>/<issue>/differences.ts から import する。比べないときは消す
  // differences: [],
}

// 撮る URL、改修前の URL、撮る版、実施日、環境の名前は、context/testing/evidence.md にある環境変数から読む
const VARIANTS = variants({
  baseUrl: process.env['<撮る URL の環境変数>'] ?? '<デフォルトの URL>',
  beforeBaseUrl: process.env['<改修前の URL の環境変数>'],
  only: process.env['<撮る版の環境変数>'],
})

const TARGET: RecordingTarget = {
  dir: evidenceDir({
    root: '<context にある、要求ごとのフォルダを並べる場所>',
    envName: process.env['<環境の名前の環境変数>'] ?? '<デフォルトの環境の名前>',
    date: evidenceDate(process.env['<実施日の環境変数>']),
    scenario: SCENARIO,
  }),
  appName: '<README に出すアプリの名前>',
  envLabel: '<字幕と README に出す環境の呼び名>',
  // ログインした後の画面から、デプロイされたバージョンを読む。読めなければ空にする
  readVersion: async (page) => {
    void page
    return ''
  },
}

/** シナリオの例の表の行。value は pull request のチェックの「<列>=<値>」の値をコピーする */
const CASES: { no: number; value: string; expected: string; act: (page: Page) => Promise<void> }[] =
  [
    {
      no: 1,
      value: '<例の値>',
      expected: '<例の表の、結果の列の文>',
      act: async (page) => {
        // <例の行の操作>
        void page
      },
    },
  ]

const body = async ({ page, step, check }: Recording, c: (typeof CASES)[number]): Promise<void> => {
  await step('前提 <前提の文>')
  // <前提の画面を開く>

  // 操作の間に見る判定の文は、操作の前に 2 行目以降で出す。字幕は次に変えるまで残る
  await step(`もし <操作の文>\nならば ${c.expected}`)
  await c.act(page)
  // その時点の画面で判定できる文は check で出し、スクリーンショットを撮る
  await check(`ならば ${c.expected}`)

  // シナリオに無い操作は、前に「(撮影のため、…)」を出してから行う
}

for (const variant of VARIANTS) {
  for (const c of CASES) {
    test(`${variant.label ? `${variant.label}: ` : ''}<アクター>が<画面>で「${c.value}」を行う`, async ({
      browser,
    }) => {
      await recordEvidence(
        browser,
        TARGET,
        { scenario: SCENARIO, variant, example: { no: c.no, column: '<例の列>', value: c.value } },
        // 録画の外で、ログインとデータの確かめを行う。このページは保存したログインの状態を持たないので、ここでログインする。戻り値は本体に渡る
        async (page) => {
          // <ログインし、前提のデータがあるかを確かめる>
          void page
        },
        (r) => body(r, c),
      )
    })
  }
}
