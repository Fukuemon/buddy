import { RECEIPT_CHECK, STAFF_MANAGE, type Viewer } from './types'

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

/** requirePermission が返す beforeLoad。宣言した権限を、route の宣言のテストが読む。 */
export type PermissionCheck = ((options: { context: { viewer: Viewer | null } }) => void) & {
  readonly permission: Permission
}

/**
 * route の beforeLoad に置き、その画面に要る権限を宣言する。
 * 権限が無ければ PermissionDeniedError を投げ、その route と子の route の loader を動かさない。
 * viewer は、root の route の beforeLoad が context に入れた値を読む。
 */
export const requirePermission = (permission: Permission): PermissionCheck =>
  Object.assign(
    ({ context }: { context: { viewer: Viewer | null } }) => {
      if (permission !== 'none' && !hasPermission(context.viewer, permission))
        throw new PermissionDeniedError(permission)
    },
    { permission },
  )
