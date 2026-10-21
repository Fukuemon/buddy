import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { savedLoginPath } from '../../kit/auth/index.js'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

/** 画面の URL。既定はルートの compose の web である。 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/**
 * compose の IdP にログインするときの名前。sub になる。
 * schedule-api は初回のログインで sub を職員に結び付けるので、手元で同じ職員に別の名前で入っていると 403 になる。
 */
export const LOGIN_NAME = process.env.E2E_LOGIN_NAME ?? 'dev-aoki'

/** compose の IdP の既定のクレームが指す、シードの職員。 */
export const LOGIN_STAFF = { id: '01M3TC5TRG5200KYWTZW6ER3WN', name: '青木 陽菜' }

/**
 * チームリーダーで入るときの名前。シードが森の sub をこの名前にしてあるので、メールによらず森になる。
 * compose の IdP の既定のメールは青木を指すので、メールでは森に結び付けられない。
 */
export const LEADER = {
  loginName: 'dev-mori',
  staff: { id: '01M3TC5VQR3MKFF9AA4BVKF44Z', name: '森 健太' },
}

/** シードの、リーダーの森と同じチーム B のメンバー。森が予定を割り振る相手である。 */
export const TEAM_MEMBER = { id: '01M5EF5AAYN3P4PYNAT0RJQYCR', name: '佐藤 美咲' }

/** シードの利用者。訪問の予定を作るときに選ぶ。 */
export const SEED_PATIENT = { id: '01M3TC66FGZVK39Y7GRVZSGWS1', name: '見本 一郎' }

/** ログインの状態を保存するディレクトリ。Git で追跡しない。 */
export const AUTH_DIR = path.join(root, 'packages/e2e/.auth')

/** 照合に使う、架空の予定と実績の CSV。 */
export const RECEIPT_TESTDATA = {
  schedules: path.join(root, 'apps/receipt-api/testdata/schedules_utf8.csv'),
  visits: path.join(root, 'apps/receipt-api/testdata/visits_cp932.csv'),
}

/** ログインした状態のファイル。setup が書き、spec の project の storageState に渡す。 */
export const LOGIN_STATE = savedLoginPath(AUTH_DIR, BASE_URL, LOGIN_NAME)

/** リーダーでログインした状態のファイル。setup が書き、リーダーの spec が storageState に渡す。 */
export const LEADER_STATE = savedLoginPath(AUTH_DIR, BASE_URL, LEADER.loginName)
