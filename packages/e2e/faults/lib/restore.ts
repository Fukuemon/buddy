// 測定の後に、入れた故障を全て戻す。失敗した測定の後も次の測定を元の状態から始めるために、afterEach から呼ぶ。
// 測定が中断したときは、run.sh が戻す。
import { expect } from '@playwright/test'

import {
  releaseBrokerStaffLock,
  restoreService,
  serviceHealth,
  setStubMode,
  unblockDatabase,
} from './compose'

/** 戻したサービスのヘルスチェックが通るまで待つ上限。compose のヘルスチェックの間隔と回数に合わせる。 */
const HEALTHY_WAIT_MS = 60_000

/** 故障を入れうるサービス。Hydra、ブローカー、API の順は、context/operations.md の復旧の手順に合わせる。 */
const SERVICES = ['hook-stub', 'hydra', 'broker', 'schedule'] as const

/** 失敗しても、残りを戻し続ける。 */
const attempt = (fn: () => unknown) => {
  try {
    fn()
  } catch {
    // 戻すものが無いときも失敗するので、続ける
  }
}

/**
 * 入れた故障を全て戻し、サービスのヘルスチェックが通るまで待つ。
 * 1 つが healthy にならなくても、残りを戻してから、最初の失敗を投げる。
 */
export const restoreAll = async () => {
  attempt(() => releaseBrokerStaffLock())
  attempt(() => unblockDatabase('broker'))
  attempt(() => unblockDatabase('hydra'))
  for (const service of SERVICES) attempt(() => restoreService(service))
  let firstError: unknown
  for (const service of SERVICES) {
    await waitHealthy(service).catch((e: unknown) => {
      firstError ??= e
    })
  }
  attempt(() => setStubMode())
  if (firstError !== undefined) throw firstError
}

/** サービスのヘルスチェックが通るまで待つ。 */
export const waitHealthy = (service: (typeof SERVICES)[number]) =>
  expect(() => expect(serviceHealth(service)).toBe('healthy')).toPass({ timeout: HEALTHY_WAIT_MS })
