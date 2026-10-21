import type { NameSearchParams } from './types'

/** 名前が条件の部分一致に当たるかを返す。条件が空か未指定なら true を返す。 */
export const matchesName = (name: string, params?: NameSearchParams) =>
  params?.name === undefined || params.name === '' || name.includes(params.name)
