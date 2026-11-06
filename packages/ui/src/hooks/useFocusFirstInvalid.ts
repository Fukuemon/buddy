import { useCallback, useEffect, useRef, useState } from 'react'

/** 誤りのある欄を指すセレクター。入力のコンポーネントは、誤りがあれば欄に aria-invalid を付ける。 */
const INVALID_SELECTOR = '[aria-invalid="true"]'

/**
 * 送った後に、ref の要素の中の最初の誤りの欄へフォーカスを移す。
 * 誤りの文は aria-describedby で欄に結び付けてあるので、欄にフォーカスが移ると読み上げられる。
 * focusFirstInvalid は誤りを state に入れた直後に呼ぶ。誤りの欄が描かれるまで待ってからフォーカスを移す。
 * selector を渡すと、aria-invalid を付けられない要素（誤りを出すボタン）を指せる。
 */
export const useFocusFirstInvalid = <T extends HTMLElement>(selector = INVALID_SELECTOR) => {
  const ref = useRef<T>(null)
  const isPendingRef = useRef(false)
  const [, setRequestCount] = useState(0)
  // react-hook-form の誤りは、focusFirstInvalid を呼んだ後の描画で出ることがある。欄が見つかるまで描画のたびに探す
  useEffect(() => {
    if (!isPendingRef.current) return
    const target = ref.current?.querySelector<HTMLElement>(selector)
    if (target === null || target === undefined) return
    isPendingRef.current = false
    target.focus()
  })
  const focusFirstInvalid = useCallback(() => {
    isPendingRef.current = true
    setRequestCount((count) => count + 1)
  }, [])
  return { ref, focusFirstInvalid }
}
