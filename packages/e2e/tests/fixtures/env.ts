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

/** ログインの状態を保存するディレクトリ。Git で追跡しない。 */
export const AUTH_DIR = path.join(root, 'packages/e2e/.auth')

/** 照合に使う、架空の予定と実績の CSV。 */
export const RECEIPT_TESTDATA = {
  schedules: path.join(root, 'apps/receipt-api/testdata/schedules_utf8.csv'),
  visits: path.join(root, 'apps/receipt-api/testdata/visits_cp932.csv'),
}

/** ログインした状態のファイル。setup が書き、spec の project の storageState に渡す。 */
export const LOGIN_STATE = savedLoginPath(AUTH_DIR, BASE_URL, LOGIN_NAME)
