export type CalendarReviewBadgeProps = {
  /** 確認が必要な予定の件数。0 か読み終える前は、印を出さない。 */
  reviewCount: number | undefined
}

/**
 * ナビゲーションの要確認の名前の右に置く、確認が必要な予定の件数の赤い丸の印。100 件以上は 99+ にする。
 * 読み上げでは、項目の名前に続けて件数を読む。
 */
export const CalendarReviewBadge = ({ reviewCount }: CalendarReviewBadgeProps) => {
  if (reviewCount === undefined || reviewCount === 0) return null
  return (
    <>
      <span
        aria-hidden="true"
        className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger px-1 text-caption font-bold text-text-inverse"
        data-testid="site-nav-review-count"
      >
        {reviewCount > 99 ? '99+' : reviewCount}
      </span>
      <span className="sr-only">{` ${reviewCount} 件`}</span>
    </>
  )
}
