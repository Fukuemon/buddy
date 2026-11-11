-- 予定の管理先と移行の言い換え（#1038）に合わせて、000012 から 000014 のコメントを当て直す。
-- 適用済みの DB のコメントを、000012 から 000014 の今の本文にそろえる。テーブルとカラムの構成は変えない。
COMMENT ON COLUMN facilities.source_mode IS '予定の管理先。google_primary は予定を Google カレンダーで管理し、予定の API から予定を書けない。buddy_primary は予定を buddy で管理し、Google カレンダーへ書き出す';
COMMENT ON COLUMN calendar_exports.error_code IS '最後に書けなかった理由。外部の予定の題名とカレンダーの ID を含めない。unappliable は、外部の変更を buddy の予定に読み替えられなかったこと。not_buddy_primary は、事業所が予定を buddy で管理していないので書かなかったこと';
COMMENT ON TABLE calendar_event_projections IS '予定を Google カレンダーで管理している事業所の、Google カレンダーの予定の写し（Projection）。1 つの予定を 1 行にする';
COMMENT ON TABLE calendar_cutovers IS '事業所の予定の管理を Google カレンダーから buddy に移す作業の記録（移行）。事業所ごとに open は 1 つまで';
COMMENT ON COLUMN calendar_cutovers.range_start IS '取り込みの期間の最初の日。移行を始めた月の初日。期間は終わりを持たない';
COMMENT ON COLUMN calendar_cutovers.started_by IS '移行を始めた職員';
COMMENT ON TABLE calendar_cutover_skips IS '移行の取り込みで、確認が必要な予定に取り込まないを選んだ記録';
COMMENT ON COLUMN import_runs.range_end IS '取り込む期間の最後の日。この日を含む。移行の取り込みでは NULL（終わりを持たない）';
COMMENT ON COLUMN import_runs.cutover_id IS '移行の取り込みのとき、その移行';
COMMENT ON COLUMN external_event_links.cutover_id IS '移行の取り込みで作った対応のとき、その移行。移行をやめると、この対応と予定を消す';
