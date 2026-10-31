import { useEffect, useState } from 'react'

import { toDateKey } from './dateTime'

const MINUTE_MS = 60_000

/**
 * 今の時刻を返し、分が変わるごとに描き直させる。今の時刻の線の位置に使う。
 * 使うコンポーネントだけが描き直されるよう、線を描くコンポーネントの近くで呼ぶ。
 */
export const useNow = () => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const untilNextMinute = MINUTE_MS - (Date.now() % MINUTE_MS)
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), MINUTE_MS)
    }, untilNextMinute)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [])
  return now
}

/** 表示している日が今日のときだけ今の時刻を返す。今日でなければ undefined にし、線を引かない。 */
export const nowForDay = (dateKey: string, now: Date) =>
  dateKey === toDateKey(now) ? now : undefined
