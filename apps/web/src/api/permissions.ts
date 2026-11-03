import type { Viewer } from './types'

/** 職員の管理の権限の code。予定の API のマイグレーションが入れる値と同じにする。 */
export const STAFF_MANAGE = 'staff.manage'

/** 照合の権限の code。予定の API のマイグレーションが入れる値と同じにする（ADR-0022）。 */
export const RECEIPT_CHECK = 'receipt.check'

/** 画面を開けるかと、画面の中のボタンとダイアログを出すかに使う権限。値は予定の API の権限の code と同じにする。 */
export type ScreenPermission = typeof STAFF_MANAGE | typeof RECEIPT_CHECK

/** 画面の出し分けに使う権限の名前。権限が無いときの案内に出す。 */
export const SCREEN_PERMISSION_NAMES: Readonly<Record<ScreenPermission, string>> = {
  [STAFF_MANAGE]: '職員の管理',
  [RECEIPT_CHECK]: '照合',
}

/** route と PermissionGuard が宣言する権限。権限の要らない画面は 'none' と宣言する。 */
export type Permission = ScreenPermission | 'none'

/**
 * 職員が権限を持つかを返す。画面の出し分けだけに使い、拒むのは API である（ADR-0025）。
 * ログインしていなければ、'none' のほかは持たないとみなす。
 */
export const hasPermission = (viewer: Viewer | null, permission: Permission): boolean =>
  permission === 'none' || (viewer?.policyCodes.includes(permission) ?? false)

/** 権限が無いことを表すエラーの message の接頭辞。サーバーで描いたエラーを受け取った後も見分けられるよう、message に権限を入れる。 */
const DENIED_PREFIX = 'permission-denied:'

/** 画面を開く権限が無いことを表すエラー。route のエラーの表示が、画面の枠の中に権限が無いことを示す。 */
export class PermissionDeniedError extends Error {
  readonly permission: ScreenPermission

  constructor(permission: ScreenPermission) {
    super(`${DENIED_PREFIX}${permission}`)
    this.name = 'PermissionDeniedError'
    this.permission = permission
  }
}

const isScreenPermission = (value: string): value is ScreenPermission =>
  Object.hasOwn(SCREEN_PERMISSION_NAMES, value)

/** エラーが権限が無いことを表すなら、足りない権限を返す。ほかのエラーなら undefined を返す。 */
export const deniedPermissionOf = (error: unknown): ScreenPermission | undefined => {
  if (!(error instanceof Error) || !error.message.startsWith(DENIED_PREFIX)) return undefined
  const permission = error.message.slice(DENIED_PREFIX.length)
  return isScreenPermission(permission) ? permission : undefined
}

/**
 * requirePermission が返す beforeLoad。宣言した権限を、route の宣言のテストが読む。
 * Result は beforeLoad の戻り値で、TanStack Router が loader と子の route の context に足す。
 */
export type PermissionCheck<Result = void> = ((options: {
  context: { viewer: Viewer | null }
}) => Result) & {
  readonly permission: Permission
}

/** 権限を確認した後の context。権限を持つ職員はログインしているので、viewer は null にならない。 */
export type PermittedContext = { viewer: Viewer }

/**
 * route の beforeLoad に置き、その画面に要る権限を宣言する。
 * 権限が無いか、ログインしていなければ PermissionDeniedError を投げ、その route と子の route の loader を動かさない。
 * 権限を持てば、root の route の beforeLoad が context に入れた viewer を、null を外した型で返す。
 * 'none' は確認をせず、何も返さない。
 */
export function requirePermission(permission: ScreenPermission): PermissionCheck<PermittedContext>
export function requirePermission(permission: 'none'): PermissionCheck
export function requirePermission(
  permission: Permission,
): PermissionCheck<PermittedContext | undefined> {
  const check = ({ context: { viewer } }: { context: { viewer: Viewer | null } }) => {
    if (permission === 'none') return undefined
    if (viewer === null || !hasPermission(viewer, permission))
      throw new PermissionDeniedError(permission)
    return { viewer }
  }
  return Object.assign(check, { permission })
}
