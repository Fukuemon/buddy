import { focusManager } from '@tanstack/react-query'
import { act } from '@testing-library/react'

/**
 * 職員がほかのウィンドウへ移り、この画面に戻ったときと同じにして、画面に古いデータを読み直させる。
 * 終わったら、ウィンドウのフォーカスの判定をブラウザの値に戻す。
 */
export const refocusWindow = () =>
  act(() => {
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    focusManager.setFocused(undefined)
  })
