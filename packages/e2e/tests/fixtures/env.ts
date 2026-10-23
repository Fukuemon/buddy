import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { savedLoginPath } from '../../kit/auth/index.js'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

/** 画面の URL。デフォルトはルートの compose の web である。 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

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

/** 2 つ目の事業所の職員。その事業所の予定だけが出ることを確かめるのに使う。 */
export const OFFICE_B = {
  email: 'nagisa.ueno@example.com',
  staff: { name: '上野 渚' },
  /** シードの、2 つ目の事業所の予定。1 つ目の事業所の予定と同じ日にある。 */
  schedule: { date: '2026-10-20', title: '第二ステーションの定例' },
}

/** シードの、止めた職員。ブローカーと予定の API の両方で止めてあり、ログインを拒まれる。 */
export const SUSPENDED_STAFF = { email: 'takumi.ono@example.com' }

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

/** シードの職員の佐藤。Google カレンダーとの同期の spec が、佐藤にカレンダーを結び付ける。 */
export const SATO = { ...TEAM_MEMBER, calendarId: 'misaki.sato@example.com' }

/** シードの職員の林。Google カレンダーへの書き出しの spec が、林にカレンダーを結び付ける。 */
export const HAYASHI = {
  id: '01M3TC5WQ08KWBZX85WAZ1C4N7',
  name: '林 さくら',
  calendarId: 'sakura.hayashi@example.com',
}

/**
 * compose の calendarpit の URL。spec は、予定の API が書いた予定を、管理の API で読んで確かめ、Google の側で直す。
 * デフォルトはルートの compose の calendarpit である。
 */
export const CALENDARPIT_URL = process.env.E2E_CALENDARPIT_URL ?? 'http://localhost:4173'

/** compose の予定の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す。 */
export const SCHEDULE_URL = process.env.E2E_SCHEDULE_URL ?? 'http://localhost:8080'

/** compose の照合の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す。 */
export const RECEIPT_URL = process.env.E2E_RECEIPT_URL ?? 'http://localhost:8090'

/** compose のブローカーのログインの画面の URL。内部の API をこのポートで受けないことを確認するのに使う。 */
export const BROKER_URL = process.env.E2E_BROKER_URL ?? 'http://localhost:8100'

/** compose のブローカーの内部の API の URL。内部の API がトークンなしの呼び出しを拒むことを確認するのに使う。 */
export const BROKER_INTERNAL_URL = process.env.E2E_BROKER_INTERNAL_URL ?? 'http://localhost:8101'

/** compose の Hydra の URL。API の参照のページで撮る spec が、ここからトークンを取る。 */
export const HYDRA_URL = process.env.E2E_HYDRA_URL ?? 'http://localhost:4444'

/** compose の、予定の API と calendarpit の間の中継の URL。デフォルトはルートの compose の gcalhold である。 */
export const GCALHOLD_URL = process.env.E2E_GCALHOLD_URL ?? 'http://localhost:8085'

/** compose の compose/google-calendar-service-accounts.json が、シードの事業所の組織に割り当てたダミーのサービスアカウント。 */
export const FACILITY_SERVICE_ACCOUNT = 'buddy-org-sample@example.iam.gserviceaccount.com'

/** シードの利用者。訪問の予定を作るときに選ぶ。 */
export const SEED_PATIENT = { id: '01M3TC66FGZVK39Y7GRVZSGWS1', name: '見本 一郎' }

/** ログインの状態を保存するディレクトリ。Git で追跡しない。 */
export const AUTH_DIR = path.join(root, 'packages/e2e/.auth')

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

/** ログインした状態のファイル。setup が書き、spec の project の storageState に渡す。 */
export const LOGIN_STATE = savedLoginPath(AUTH_DIR, BASE_URL, 'aoki')

/** リーダーでログインした状態のファイル。setup が書き、リーダーの spec が storageState に渡す。 */
export const LEADER_STATE = savedLoginPath(AUTH_DIR, BASE_URL, 'mori')
