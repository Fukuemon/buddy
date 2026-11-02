import type { BuddyApi, ReceiptApi } from './BuddyApi'

/**
 * fake の実装とダミーデータを読み込む。bff のビルドで呼ぶと Error で失敗する。
 *
 * Vite は `import.meta.env.VITE_API_MODE` をビルドのときに値に置き換えるので、bff のビルドでは import() ごと消え、
 * fake の実装とダミーデータ（src/mocks/scheduleData.ts）がブラウザとサーバーのどちらのビルドにも入らない。
 */
export const loadFake = () =>
  import.meta.env.VITE_API_MODE === 'bff'
    ? Promise.reject(new Error('bff のビルドには fake の実装が入っていない'))
    : import('./fake')

type Method = (...args: unknown[]) => Promise<unknown>
type Group = Record<PropertyKey, Method>

/**
 * load が返す BuddyApi に呼び出しを渡す BuddyApi を作る。
 * メソッドは呼んだときに load を待つので、読み込みの前に API の値を router の context に入れられる。
 * 同じ名前のグループとメソッドは、毎回同じ値を返す。
 */
const deferredBuddyApi = (load: () => Promise<BuddyApi>): BuddyApi => {
  const groups = new Map<PropertyKey, Group>()
  const group = (groupName: string): Group => {
    const methods = new Map<PropertyKey, Method>()
    return new Proxy({} as Group, {
      get: (_, methodName) => {
        // Promise の解決と React の開発時の確認が then と symbol を読むので、メソッドとして返さない
        if (typeof methodName === 'symbol' || methodName === 'then') return undefined
        const cached = methods.get(methodName)
        if (cached !== undefined) return cached
        const method: Method = async (...args) => {
          const api = (await load()) as unknown as Record<string, Group>
          return api[groupName][methodName](...args)
        }
        methods.set(methodName, method)
        return method
      },
    })
  }
  return new Proxy({} as BuddyApi, {
    get: (_, groupName) => {
      if (typeof groupName === 'symbol' || groupName === 'then') return undefined
      const cached = groups.get(groupName)
      if (cached !== undefined) return cached
      const created = group(groupName)
      groups.set(groupName, created)
      return created
    },
  })
}

/**
 * 初めて呼んだときに fake の実装を読み込む BuddyApi と ReceiptApi を作る。
 * 読み込みは 1 度だけにし、作った fake の実装とそのメモリのデータを使い続ける。
 */
export const createDeferredFakeApis = (): { api: BuddyApi; receiptApi: ReceiptApi } => {
  let loaded: Promise<{ api: BuddyApi; receiptApi: ReceiptApi }> | undefined
  const load = () =>
    (loaded ??= loadFake().then((fake) => ({
      api: fake.createFakeBuddyApi(),
      receiptApi: fake.createFakeReceiptApi(),
    })))
  return {
    api: deferredBuddyApi(async () => (await load()).api),
    receiptApi: { check: async (input) => (await load()).receiptApi.check(input) },
  }
}
