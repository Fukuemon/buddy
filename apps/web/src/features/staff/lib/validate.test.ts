import { describe, expect, it } from 'vite-plus/test'

import { phoneNumberOf, validateEmail, validateName, validatePhone } from './validate'

describe('validate', () => {
  it('名前の空と、メールアドレスの形でない値を誤りにする', () => {
    expect(validateName('  ')).toBe('名前を入れてください')
    expect(validateName('林 さくら')).toBeUndefined()
    expect(validateEmail('sakura.hayashi')).toBe('メールアドレスの形で入れてください')
    expect(validateEmail('sakura.hayashi@example.com')).toBeUndefined()
  })

  it('電話番号は、空か、先頭の + と 11 桁までの数字だけを通す', () => {
    expect(validatePhone('')).toBeUndefined()
    expect(validatePhone('+09012345678')).toBeUndefined()
    expect(validatePhone('090123456789')).toBe('電話番号は数字で 11 桁まで入れてください')
    expect(validatePhone('090-1234-5678')).toBe('電話番号は数字で 11 桁まで入れてください')
    expect(phoneNumberOf(' ')).toBeNull()
  })
})
