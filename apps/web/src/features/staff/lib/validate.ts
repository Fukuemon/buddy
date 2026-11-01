/** 職員の名前の、予定の API が受ける最大の文字数。 */
export const STAFF_NAME_MAX_LENGTH = 128

/** 入力の欄ごとの誤りの文。誤りの無い欄は持たない。 */
export type StaffFormErrors = Partial<Record<'name' | 'email' | 'phone', string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?\d{1,11}$/

/** 名前が空でないかを確認し、誤りの文を返す。 */
export const validateName = (name: string) =>
  name.trim() === '' ? '名前を入れてください' : undefined

/** メールアドレスの形を確認し、誤りの文を返す。 */
export const validateEmail = (email: string) =>
  EMAIL_PATTERN.test(email.trim()) ? undefined : 'メールアドレスの形で入れてください'

/** 電話番号が数字と先頭の + だけで、数字が 11 桁までかを確認し、誤りの文を返す。空は省いたとみなして通す。 */
export const validatePhone = (phone: string) =>
  phone.trim() === '' || PHONE_PATTERN.test(phone.trim())
    ? undefined
    : '電話番号は数字で 11 桁まで入れてください'

/** 電話番号の入力を、送る値にする。空なら null にする。 */
export const phoneNumberOf = (phone: string) => (phone.trim() === '' ? null : phone.trim())
