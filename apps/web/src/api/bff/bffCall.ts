/** BFF が中継する BuddyApi の操作。 */
export const BFF_OPERATIONS = [
  'schedules.list',
  'schedules.get',
  'schedules.create',
  'schedules.update',
  'staff.list',
  'teams.list',
  'patients.list',
] as const

export type BffOperation = (typeof BFF_OPERATIONS)[number]

/** 画面から BFF への呼び出し。args は BuddyApi の操作の引数で、先頭は事業所である。 */
export type BffCall = { op: BffOperation; args: unknown[] }

/** BuddyApi の操作が返す値。JSON にできる値に限る。 */
export type BffData = string | number | boolean | null | BffData[] | { [key: string]: BffData }

/** BFF の応答。ApiError は class のままでは server function を越えられないので、値にして返す。 */
export type BffResult = { ok: true; data: BffData } | { ok: false; status: number; message: string }

/** server function の入力を BffCall として読む。知らない操作か形の誤りなら Error を投げる。 */
export const parseBffCall = (input: unknown): BffCall => {
  if (typeof input !== 'object' || input === null) throw new Error('BFF の呼び出しの形が正しくない')
  const { op, args } = input as Record<string, unknown>
  if (!BFF_OPERATIONS.includes(op as BffOperation))
    throw new Error(`BFF が中継しない操作 ${String(op)}`)
  if (!Array.isArray(args)) throw new Error('BFF の呼び出しの args は配列にする')
  return { op: op as BffOperation, args }
}
