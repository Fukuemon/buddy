import { useCallback, useEffect, useRef, useState } from 'react'

/** 誤りのある欄を指すセレクター。入力のコンポーネントは、誤りがあれば欄に aria-invalid を付ける。 */
const INVALID_SELECTOR = '[aria-invalid="true"]'

/**
 * 送った後に、ref の要素の中の最初の誤りの欄へフォーカスを移す。
 * 誤りの文は aria-describedby で欄に結び付けてあるので、欄にフォーカスが移ると読み上げられる。
 * focusFirstInvalid は誤りを state に入れた直後に呼ぶ。誤りの描画を待ってからフォーカスを移す。
 * selector を渡すと、aria-invalid を付けられない要素（誤りを出すボタン）を指せる。
 */
export const useFocusFirstInvalid = <T extends HTMLElement>(selector = INVALID_SELECTOR) => {
  const ref = useRef<T>(null)
  const [requestCount, setRequestCount] = useState(0)
  useEffect(() => {
    if (requestCount === 0) return
    ref.current?.querySelector<HTMLElement>(selector)?.focus()
  }, [requestCount, selector])
  const focusFirstInvalid = useCallback(() => setRequestCount((count) => count + 1), [])
  return { ref, focusFirstInvalid }
}
