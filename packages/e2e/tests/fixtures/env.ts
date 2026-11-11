import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

// worktrunk で作った worktree では、.config/wt.toml がリポジトリのルートの .env に E2E の URL を書く（ADR-0036）。
// loadEnvFile は既にある環境変数を上書きしないので、コマンドの前で渡した URL が .env より優先される
const worktreeEnv = path.join(root, '.env')
if (existsSync(worktreeEnv)) process.loadEnvFile(worktreeEnv)

/** 画面の URL。デフォルトは main の checkout の compose の web である。 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'https://web.buddy.localhost'

/**
 * ブローカーのログインの画面で入れるメール。ブローカーのシードの青木 陽菜を指す。
 * 上流の IdP のフェイクには、同じメールを確認済みのクレームにして入る（screens/login.ts の signIn）。
 */
export const LOGIN_EMAIL = 'hina.aoki@example.com'

/** LOGIN_EMAIL で入る、予定の API のシードの職員。 */
export const LOGIN_STAFF = { id: '01M3TC5TRG5200KYWTZW6ER3WN', name: '青木 陽菜' }

/** チームリーダーで入るときのメールと、予定の API のシードの職員。 */
export const LEADER = {
  email: 'kenta.mori@example.com',
  staff: { id: '01M3TC5VQR3MKFF9AA4BVKF44Z', name: '森 健太' },
}

/** 2 つ目の事業所の職員。その事業所の予定だけが出ることを確認するのに使う。 */
export const OFFICE_B = {
  email: 'nagisa.ueno@example.com',
  staff: { id: '01M5J5EE04P946KC3JAE2P1JQ4', name: '上野 渚' },
  facilityId: '01M5J5EE00QGG4M6GGZQ9AT9GW',
  /** シードの、2 つ目の事業所の予定。1 つ目の事業所の予定と同じ日にある。 */
  schedule: { date: '2026-10-20', title: '第二ステーションの定例' },
}

/** シードの、2 つ目の事業所の休職の職員。ブローカーと予定の API の両方で止めてあり、ログインを拒まれる。 */
export const SUSPENDED_STAFF = {
  id: '01M5J5EE0AV3M9P2QF6ZK8RTNC',
  name: '小野 拓海',
  email: 'takumi.ono@example.com',
}

/** ブローカーにも予定の API にも登録していないメール。 */
export const UNREGISTERED_EMAIL = 'nobody@example.com'

/** シードの、1 つ目の事業所の予定。OFFICE_B.schedule と同じ日にある。 */
export const OFFICE_A_SCHEDULE = { date: '2026-10-20', title: 'カンファレンス' }

/** シードの、リーダーの森と同じチーム B のメンバー。森が予定を割り振る相手である。 */
export const TEAM_MEMBER = {
  id: '01M5EF5AAYN3P4PYNAT0RJQYCR',
  name: '佐藤 美咲',
  email: 'misaki.sato@example.com',
}

/** シードの、1 つ目の事業所の事務の職員。訪問しない職員で、照合の権限を持つ。 */
export const OFFICE_CLERK = {
  id: '01M6Q1D8E0JX4N7R2T5W8Y3B6C',
  name: '中村 結衣',
  email: 'yui.nakamura@example.com',
}

/**
 * シードの 3 つ目の事業所の職員。事業所は Google カレンダーを予定の正本にし（google_primary）、岡田には calendarpit のカレンダーを結び付けてある。
 * 同期の Worker が、このカレンダーの予定を Projection に写す。
 */
export const OKADA = {
  email: 'aoi.okada@example.com',
  staff: { id: '01MA0GP0000000000000000STF', name: '岡田 葵' },
  /** シードの 3 つ目の事業所（google_primary）の ID。 */
  facilityId: '01MA0GP0000000000000000FAC',
  calendarId: 'aoi.okada@example.com',
  /** シードで岡田に結び付けたカレンダー（external_calendars）の ID。同期の状況の行を指すのに使う。 */
  externalCalendarId: '01MA0GP0000000000000000GCA',
}

/**
 * シードの 4 つ目の事業所の職員。事業所は Google カレンダーを予定の正本にし（google_primary）、石田には calendarpit のカレンダーを
 * 結び付けてある。予定の正本の切り替えの spec だけが使う。切り替えを完了すると事業所は buddy_primary に移り、戻せない。
 */
export const ISHIDA = {
  email: 'ren.ishida@example.com',
  staff: { id: '01MA0CT0000000000000000STF', name: '石田 蓮' },
  /** シードの 4 つ目の事業所（google_primary）の ID。 */
  facilityId: '01MA0CT0000000000000000FAC',
  calendarId: 'ren.ishida@example.com',
}

/** シードの職員の佐藤。Google カレンダーとの同期の spec が、佐藤にカレンダーを結び付ける。 */
export const SATO = { ...TEAM_MEMBER, calendarId: 'misaki.sato@example.com' }

/**
 * シードの職員の林。Google カレンダーへの書き出しの spec が、林にカレンダーを結び付ける。
 * 林はメンバーで、自分の予定の編集と、森の予定の閲覧の権限を持つ。森の予定は見られるが、編集できない。
 */
export const HAYASHI = {
  id: '01M3TC5WQ08KWBZX85WAZ1C4N7',
  name: '林 さくら',
  email: 'sakura.hayashi@example.com',
  calendarId: 'sakura.hayashi@example.com',
}

/**
 * compose の calendarpit の URL。spec は、予定の API が書いた予定を、管理の API で読んで確認し、Google の側で直す。
 * デフォルトはルートの compose の calendarpit である。
 */
export const CALENDARPIT_URL =
  process.env.E2E_CALENDARPIT_URL ?? 'https://calendarpit.buddy.localhost'

/** compose の予定の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す。 */
export const SCHEDULE_URL = process.env.E2E_SCHEDULE_URL ?? 'https://schedule.buddy.localhost'

/** compose の照合の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す。 */
export const RECEIPT_URL = process.env.E2E_RECEIPT_URL ?? 'https://receipt.buddy.localhost'

/** compose のブローカーのログインの画面の URL。内部の API をこのポートで受けないことを確認するのに使う。 */
export const BROKER_URL = process.env.E2E_BROKER_URL ?? 'https://broker.buddy.localhost'

/** compose のブローカーの内部の API の URL。内部の API がトークンなしの呼び出しを拒むことを確認するのに使う。 */
export const BROKER_INTERNAL_URL =
  process.env.E2E_BROKER_INTERNAL_URL ?? 'https://8081.broker.buddy.localhost'

/** compose の Hydra の URL。API の参照のページで撮る spec が、ここからトークンを取る。 */
export const HYDRA_URL = process.env.E2E_HYDRA_URL ?? 'https://hydra.buddy.localhost'

/** compose の、予定の API と calendarpit の間の中継の URL。デフォルトはルートの compose の gcalhold である。 */
export const GCALHOLD_URL = process.env.E2E_GCALHOLD_URL ?? 'https://gcalhold.buddy.localhost'

/** compose の compose/google-calendar-service-accounts.json が、シードの事業所の組織に割り当てたダミーのサービスアカウント。 */
export const FACILITY_SERVICE_ACCOUNT = 'buddy-org-sample@example.iam.gserviceaccount.com'

/** シードの利用者。訪問の予定を作るときに選ぶ。利用者のサービスコードは訪看I2 である。 */
export const SEED_PATIENT = { id: '01M3TC66FGZVK39Y7GRVZSGWS1', name: '見本 一郎' }

/** シードの、サービスコードが訪看I3 の利用者。利用者を選んだときのサービスコードの初期値を確認するのに使う。 */
export const SEED_PATIENT_I3 = { id: '01M3TC67EREWP3ED55WDTKD23Z', name: '見本 二葉' }

/** ログインの状態を保存するディレクトリ。Git で追跡しない。 */
const AUTH_DIR = path.join(root, 'packages/e2e/.auth')

/** 照合に使う、ダミーの予定と実績の CSV。 */
export const RECEIPT_TESTDATA = {
  schedules: path.join(root, 'services/receipt/testdata/schedules_utf8.csv'),
  visits: path.join(root, 'services/receipt/testdata/visits_cp932.csv'),
  /**
   * calendarpit の森のカレンダーの 2026 年 11 月の予定と照合する実績。
   * 11/02 の見本 一郎は整合し、11/04 の見本 二葉は開始時間が、11/18 の見本 二葉はサービス内容が予定と違う。
   */
  calendarVisits: path.join(root, 'services/receipt/testdata/visits_2026-11_utf8.csv'),
}

/** ブラウザの時間帯。画面は日時をデバイスの時間帯で出すので、spec と録画をこの時間帯で動かす。 */
export const TIMEZONE_ID = 'Asia/Tokyo'

/**
 * ログインした状態を保存するファイルのパス。`.auth/<ホスト>/<key>.json` を返す。
 * 改修前と改修後の環境で同じ職員の状態が混ざらないよう、BASE_URL のホストごとに分ける。
 */
const loginStatePath = (key: string): string =>
  path.join(AUTH_DIR, new URL(BASE_URL).host.replaceAll(':', '_'), `${key}.json`)

/** ログインした状態のファイル。setup が書き、spec の project の storageState に渡す。 */
export const LOGIN_STATE = loginStatePath('aoki')

/** Google カレンダーを正本にする事業所の岡田でログインした状態のファイル。setup が書き、その事業所の spec が storageState に渡す。 */
export const OKADA_STATE = loginStatePath('okada')

/** 予定の正本の切り替えを確認する事業所の石田でログインした状態のファイル。setup が書き、切り替えの spec が storageState に渡す。 */
export const ISHIDA_STATE = loginStatePath('ishida')

/** リーダーでログインした状態のファイル。setup が書き、リーダーの spec が storageState に渡す。 */
export const LEADER_STATE = loginStatePath('mori')

/** メンバーの林でログインした状態のファイル。setup が書き、林で撮るエビデンスの spec が storageState に渡す。 */
export const HAYASHI_STATE = loginStatePath('hayashi')

/** 1 つ目の事業所の事務の中村でログインした状態のファイル。setup が書き、事務の職員で撮るエビデンスの spec が storageState に渡す。 */
export const OFFICE_CLERK_STATE = loginStatePath('nakamura')
