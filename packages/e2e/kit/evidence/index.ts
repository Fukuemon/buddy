import path from 'node:path'

/** 撮る版と、開くアプリの URL。改修前と比べないときは、名前の無い 1 つの版(single)を撮る */
export type Variant =
  | { name: 'single'; label: ''; baseUrl: string }
  | { name: 'after'; label: '改修後'; baseUrl: string }
  | { name: 'before'; label: '改修前'; baseUrl: string }

/**
 * 撮る版の一覧。既定は、baseUrl を名前の無い 1 つの版として撮る。
 *
 * @param o.beforeBaseUrl 渡すと、baseUrl を改修後、beforeBaseUrl を改修前として撮る。振る舞いを変えない改修を、改修前と比べて確かめるときに使う
 * @param o.only 'before' か 'after'。渡すと、baseUrl をその版として 1 つだけ撮る。改修前と改修後を別の環境で 1 回ずつ撮るときに使う。ほかの値では例外を投げる
 */
export const variants = (o: {
  baseUrl: string
  beforeBaseUrl?: string
  only?: string
}): Variant[] => {
  const after: Variant = { name: 'after', label: '改修後', baseUrl: o.baseUrl }
  const before = (baseUrl: string): Variant => ({ name: 'before', label: '改修前', baseUrl })
  if (o.only === 'after') return [after]
  if (o.only === 'before') return [before(o.baseUrl)]
  if (o.only) throw new Error(`撮る版は before か after にする: ${o.only}`)
  return o.beforeBaseUrl
    ? [after, before(o.beforeBaseUrl)]
    : [{ name: 'single', label: '', baseUrl: o.baseUrl }]
}

/**
 * 検証シナリオ。値は検証シナリオのファイルと pull request から、文言を変えずに写す。
 * id は検証シナリオの @scenario-id で、証跡とシナリオを対応付ける。
 * issue は要求の issue 番号で、証跡の格納先の要求のフォルダと同じ番号にする。検証シナリオのファイルの番号とは違うことがある。
 * no は pull request の証跡の S 番号。アクターをまたいだ通し番号で、pull request の証跡のフォルダの名前から写す。
 */
export type Scenario = {
  issue: string
  id: string
  actor: string
  no: number
  title: string
  /** 検証シナリオの備考で、改修前と違ってよいとされた差のうち、どの静止画にも映りうるもの。README に一覧で出す */
  differences?: string[]
}

/** シナリオアウトラインの「例」の 1 行。column は pull request のチェックの「<column>=<value>」に合わせる */
export type Example = { no: number; column: string; value: string }

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * 証跡の置き場の実施日を YYYY-MM-DD で返す。
 *
 * @param given YYYY-MM-DD。無ければ流した日にする。改修前と改修後を日をまたいで 1 回ずつ撮るとき、2 回目に 1 回目の日付を渡して同じ置き場にそろえる。形が違えば例外を投げる
 */
export const evidenceDate = (given?: string): string => {
  if (given && !/^\d{4}-\d{2}-\d{2}$/.test(given))
    throw new Error(`実施日は YYYY-MM-DD にする: ${given}`)
  return given ?? ymd(new Date())
}

/**
 * 1 つのシナリオの証跡の置き場。<root>/<issue>/evidence/<envName>/<date>/<アクター>/S<n>_<シナリオ名>/ になる。
 * <アクター>/ から下は 証跡の格納先のフォルダと同じ形にし、シナリオのフォルダをそのまま上げられるようにする。
 *
 * @param o.root 要求ごとのフォルダを並べる場所(例: tests/specs)
 * @param o.date evidenceDate の戻り値
 */
export const evidenceDir = (o: {
  root: string
  envName: string
  date: string
  scenario: Scenario
}): string =>
  path.resolve(
    o.root,
    o.scenario.issue,
    'evidence',
    o.envName,
    o.date,
    o.scenario.actor,
    `S${o.scenario.no}_${o.scenario.title}`,
  )

/** 証跡のファイル名(拡張子なし)。例の行ごとに、改修前と改修後が名前の順で隣り合う */
export const evidenceName = (variant: Variant, example?: Example): string =>
  [...(example ? [String(example.no).padStart(2, '0'), example.value] : []), variant.label]
    .filter(Boolean)
    .join('_') || '実施'
