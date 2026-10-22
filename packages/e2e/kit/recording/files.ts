import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Example, Scenario, Variant } from '../evidence/index.js'
import { CURSOR_LEGEND } from './cursor.js'

/** 撮った記録(json)と、変換する前の webm の配置先。エビデンスの格納先へは上げないので、隠しフォルダにする */
export const RECORDS_DIR = '.records'

/**
 * 字幕を出した時刻(録画のコンテキストでページを開いてからの秒)と、そのときに撮ったスクリーンショット。
 * allowed は、そのスクリーンショットで改修前と違ってよい差(検証シナリオの備考からコピーする)
 */
export type CaptionAt = { at: number; text: string; frame?: string; allowed?: string }

type Take = {
  name: string
  header: string
  appName: string
  envLabel: string
  /** 撮ったときにデプロイされていたアプリのバージョン */
  version?: string
  scenario: Scenario
  variant: Variant
  example?: Example
  captions: CaptionAt[]
  /** ページを開いてから操作を終えるまでの秒 */
  elapsed: number
  failure?: string
  codec?: string
  seconds?: number
}

const run = (cmd: string, args: string[]): string => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    throw new Error(
      `${cmd} が失敗した。ffmpeg と ffprobe を入れる(packages/e2e/README.md): ${String(e)}`,
    )
  }
}

const clock = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

/**
 * .records/<name>.webm を、QuickTime とブラウザで再生できる H.264 の <name>.mp4 に変換して webm を消し、
 * 撮った記録を .records/<name>.json に残して README.md を書き直す。
 */
export const finishEvidence = (dir: string, take: Omit<Take, 'codec' | 'seconds'>): void => {
  const webm = path.join(dir, RECORDS_DIR, `${take.name}.webm`)
  const mp4 = path.join(dir, `${take.name}.mp4`)
  run('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    webm,
    // yuv420p の H.264 は、幅か高さが奇数だと変換に失敗するので、偶数にそろえる
    '-vf',
    'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    mp4,
  ])
  const probe = JSON.parse(
    run('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name:format=duration',
      '-of',
      'json',
      mp4,
    ]),
  ) as { streams: { codec_name: string }[]; format: { duration: string } }
  const seconds = Number(probe.format.duration)

  const done: Take = { ...take, codec: probe.streams[0]?.codec_name, seconds }
  rmSync(webm)
  writeFileSync(path.join(dir, RECORDS_DIR, `${take.name}.json`), JSON.stringify(done, null, 2))
  writeReadme(dir)
}

/** 撮り直す前に、同じ名前の前の撮影の記録、動画、スクリーンショットを消す。ほかの名前の撮影の記録は残す */
export const clearTake = (dir: string, name: string): void => {
  rmSync(path.join(dir, RECORDS_DIR, `${name}.json`), { force: true })
  rmSync(path.join(dir, `${name}.mp4`), { force: true })
  const frames = path.join(dir, 'frames')
  for (const f of readdirSync(frames))
    if (f.startsWith(`${name}-`) && /^\d+\.png$/.test(f.slice(name.length + 1)))
      rmSync(path.join(frames, f))
}

/** シナリオの配置先の README を、.records/ にある撮った記録の全部から書き直す */
const writeReadme = (dir: string): void => {
  const files = readdirSync(path.join(dir, RECORDS_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()
  const takes = files.map(
    (f) => JSON.parse(readFileSync(path.join(dir, RECORDS_DIR, f), 'utf8')) as Take,
  )
  // spec で書き直したシナリオの値(違ってよい差など)が README に出るよう、最後に書いた記録のシナリオを使う
  const modified = (f: string) => statSync(path.join(dir, RECORDS_DIR, f)).mtimeMs
  const { scenario, envLabel, appName } =
    takes[files.indexOf(files.reduce((a, b) => (modified(b) > modified(a) ? b : a)))]
  // 改修前を撮っていなければ、比べる列と説明を出さない
  const comparing = takes.some((t) => t.variant.name === 'before')
  const columns = comparing ? ['改修前', '改修後'] : ['エビデンス']
  const fileOf = (no: number | undefined, column: string) =>
    takes.find((t) => t.example?.no === no && (!comparing || t.variant.label === column))?.name ??
    ''
  const rows = [...new Map(takes.map((t) => [t.example?.no, t.example])).values()].map((ex) => {
    const cells = columns.map((c) =>
      fileOf(ex?.no, c) ? `${fileOf(ex?.no, c)}.mp4` : '撮っていない',
    )
    return `| ${ex ? `${ex.column}=${ex.value}` : '実施'} | ${cells.join(' | ')} |`
  })
  const urls = [
    ...new Map(
      takes.map((t) => [
        t.variant.label,
        `${t.variant.baseUrl}${t.version ? `(${t.version})` : ''}`,
      ]),
    ).entries(),
  ].map(([l, u]) => `- ${l ? `${l}の ` : ''}${appName}: ${u}`)
  const compared = writeComparisons(dir, takes)

  const sections = takes.map((t) => {
    // 録画はページを開いた直後の何も描いていない間を持たないので、動画の尺は操作の時間より短い。差を引いて動画の時刻にする
    const lag = Math.max(0, t.elapsed - (t.seconds ?? t.elapsed))
    const lines = t.captions.map(
      (c) =>
        `| ${clock(Math.max(0, c.at - lag))} | ${c.text.replaceAll('\n', '<br>')} | ${c.frame ?? ''} |`,
    )
    return [
      `## ${t.name}.mp4`,
      '',
      `${t.codec}、${t.seconds?.toFixed(1)} 秒。字幕の 1 行目は「${t.header}」。`,
      ...(t.failure ? ['', `**撮影が途中で失敗した**: ${t.failure}`] : []),
      '',
      '| 時刻 | 字幕 | スクリーンショット |',
      '| --- | --- | --- |',
      ...lines,
    ].join('\n')
  })

  const readme = [
    `# S${scenario.no}_${scenario.title}`,
    '',
    `- シナリオ: ${scenario.id}`,
    `- アクター: ${scenario.actor}`,
    `- 環境: ${envLabel}`,
    ...urls,
    '',
    'spec が画面を操作して撮った。判定は、人が動画を見て行う。',
    ...(comparing
      ? ['改修前と改修後で判定の場面がずれていないかは、「改修前と改修後の比較」の画像で見る。']
      : []),
    '時刻は字幕を出した動画の時刻で、1 秒ほどずれることがある。スクリーンショットは、判定の字幕を出し終えた時点の画面である。',
    `動画の上端の字幕は、1 段目がどのエビデンスか、撮った環境とバージョン、${CURSOR_LEGEND.replace('カーソル: ', 'カーソルの凡例(')})で、2 段目から下が検証シナリオの手順と判定の文である。`,
    '',
    `| 例 | ${columns.join(' | ')} |`,
    `| --- |${' --- |'.repeat(columns.length)}`,
    ...rows,
    '',
    ...(comparing ? differencesSection(scenario) : []),
    ...compared,
    sections.join('\n\n'),
    '',
  ].join('\n')
  writeFileSync(path.join(dir, 'README.md'), readme)
}

// 比較の画像の片側の幅(px)。2 枚を並べて 1 枚にする
const COMPARE_HALF_WIDTH = 1280

/**
 * 同じ例の行の改修前と改修後のスクリーンショットを、判定の字幕の順に左右に並べて compare/ に書き出し、README の節を返す。
 * 左が改修前、右が改修後。片方しか撮っていない例の行は飛ばす。
 */
const writeComparisons = (dir: string, takes: Take[]): string[] => {
  const pairs = [...new Set(takes.map((t) => t.example?.no))].flatMap((no) => {
    const before = takes.find((t) => t.example?.no === no && t.variant.label === '改修前')
    const after = takes.find((t) => t.example?.no === no && t.variant.label === '改修後')
    return before && after ? [{ before, after }] : []
  })
  // 残っている記録から作り直す。撮り直して組が変わった前の画像を残さない
  rmSync(path.join(dir, 'compare'), { recursive: true, force: true })
  if (pairs.length === 0) return []
  mkdirSync(path.join(dir, 'compare'), { recursive: true })
  const lines = pairs.flatMap(({ before, after }) => {
    const left = before.captions.filter((c) => c.frame)
    const right = after.captions.filter((c) => c.frame)
    const base = before.name.replace(/_?改修前$/, '') || '実施'
    return left.slice(0, right.length).map((c, i) => {
      const out = `compare/${base}-${i + 1}.png`
      const scale = `scale=${COMPARE_HALF_WIDTH}:-1`
      run('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        path.join(dir, c.frame!),
        '-i',
        path.join(dir, right[i].frame!),
        '-filter_complex',
        `[0]${scale}[a];[1]${scale}[b];[a][b]hstack`,
        path.join(dir, out),
      ])
      const ex = before.example ? `${before.example.column}=${before.example.value}` : '実施'
      const allowed = c.allowed ?? right[i].allowed ?? ''
      return `| ${ex} | ${c.text.replaceAll('\n', '<br>')} | ${out} | ${allowed} |`
    })
  })
  return [
    '## 改修前と改修後の比較',
    '',
    '左が改修前、右が改修後。判定の字幕を出し終えた時点のスクリーンショットを、字幕の順に並べた。',
    '「違ってよい差」の列は、検証シナリオの備考で、そのスクリーンショットで改修前と違ってよいとされた差である。空の行で差があれば、備考に無い差なので担当者に伝える。',
    '',
    '| 例 | 判定の字幕 | 画像 | 違ってよい差 |',
    '| --- | --- | --- | --- |',
    ...lines,
    '',
  ]
}

/** 検証シナリオの備考で、改修前と違ってよいとされた差のうち、どのスクリーンショットにも映りうるものの節 */
const differencesSection = (scenario: Scenario): string[] =>
  scenario.differences?.length
    ? [
        '## 改修前と違ってよい差',
        '',
        '検証シナリオの備考で、改修前と違ってよいとされた差のうち、どのスクリーンショットにも映りうるもの。',
        '',
        ...scenario.differences.map((d) => `- ${d}`),
        '',
      ]
    : []
