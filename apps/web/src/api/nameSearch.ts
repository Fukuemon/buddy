import type { NameSearchParams } from './types'

export const matchesName = (name: string, params?: NameSearchParams) =>
  params?.name === undefined || params.name === '' || name.includes(params.name)
