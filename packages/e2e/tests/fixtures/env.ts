import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { savedLoginPath } from '../../kit/auth/index.js'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

/** 画面の URL。デフォルトはルートの compose の web である。 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/**
 * compose の IdP にログインするときの名前。sub になる。
 * schedule-api は初回のログインで sub を職員に結び付けるので、ローカル環境で同じ職員に別の名前で入っていると 403 になる。
 */
export const LOGIN_NAME = process.env.E2E_LOGIN_NAME ?? 'dev-aoki'

/** compose の IdP のデフォルトのクレームが指す、シードの職員。 */
export const LOGIN_STAFF = { id: '01M3TC5TRG5200KYWTZW6ER3WN', name: '青木 陽菜' }

/**
 * チームリーダーで入るときの名前。シードが森の sub をこの名前にしてあるので、メールによらず森になる。
 * compose の IdP のデフォルトのメールは青木を指すので、メールでは森に結び付けられない。
 */
export const LEADER = {
  loginName: 'dev-mori',
  staff: { id: '01M3TC5VQR3MKFF9AA4BVKF44Z', name: '森 健太' },
}

/** シードの、リーダーの森と同じチーム B のメンバー。森が予定を割り振る相手である。 */
export const TEAM_MEMBER = { id: '01M5EF5AAYN3P4PYNAT0RJQYCR', name: '佐藤 美咲' }

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
export const SCHEDULE_API_URL = process.env.E2E_SCHEDULE_API_URL ?? 'http://localhost:8080'

/** compose の照合の API の URL。API の参照のページから送ったリクエストを、ここへ送り直す。 */
export const RECEIPT_API_URL = process.env.E2E_RECEIPT_API_URL ?? 'http://localhost:8090'

/** compose の IdP の URL。API の参照のページで撮る spec が、ここからトークンを取る。 */
export const IDP_URL = process.env.E2E_IDP_URL ?? 'http://localhost:9000'

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

/** ログインした状態のファイル。setup が書き、spec の project の storageState に渡す。 */
export const LOGIN_STATE = savedLoginPath(AUTH_DIR, BASE_URL, LOGIN_NAME)

/** リーダーでログインした状態のファイル。setup が書き、リーダーの spec が storageState に渡す。 */
export const LEADER_STATE = savedLoginPath(AUTH_DIR, BASE_URL, LEADER.loginName)
