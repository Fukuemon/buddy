import { useEffect, useState } from 'react'

const MINUTE_MS = 60_000

/** 今の時刻を返し、分が変わるごとに描き直させる。今の時刻の線の位置に使う。 */
export const useNow = () => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    // 次の分の変わり目にそろえてから、1 分ごとに進める
    const timeout = setTimeout(
      () => {
        setNow(new Date())
        interval = setInterval(() => setNow(new Date()), MINUTE_MS)
      },
      MINUTE_MS - (Date.now() % MINUTE_MS),
    )
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])
  return now
}
