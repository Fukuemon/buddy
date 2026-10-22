/** キャンセルした予定の前に置く「キャンセル」の印。取り消し線と一緒に使い、色だけで伝えない。 */
export const CancelledMark = () => (
  <>
    <span className="mr-1 rounded-4 bg-surface px-1 font-bold text-text">キャンセル</span>
    {/* 取り消し線は読み上げられないので、印と時刻の間で区切って読ませる */}
    <span className="sr-only">、</span>
  </>
)
