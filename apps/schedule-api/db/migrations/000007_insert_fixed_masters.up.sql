-- 事業所に属さず、全ての環境で同じ値のマスタを入れる。シードを当てない本番でも予定を作れるようにする。
-- 既に同じ ID か同じ名前の行がある環境では、行を増やさずに値をこの表記にそろえる。
-- サービスコードの表記は、API の値をそのまま比べる web（apps/web/src/api/types.ts の SERVICE_CODES）に合わせる。
-- 提供時間の範囲は、receipt-api の servicerule と照合の Design Doc に合わせる。
-- 行の別名（AS new）は sqlc の構文解析が読めないので、非推奨の VALUES() で新しい値を参照する。
INSERT INTO schedule_types (id, name) VALUES
    ('01M3TC68E05E1N46YCCBT6ZQB2', '通常'),
    ('01M3TC69D8KB2938F3GS7WBVT5', '訪問')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO service_codes (id, code, service_time_range_start, service_time_range_end) VALUES
    ('01M3TC60M0XC173N54CJQRKFVR', '訪看I2', 20, 29),
    ('01M3TC61K82WSVMKHFBEVC4NYM', '訪看I3', 30, 59),
    ('01M3TC62JGSGQN3D5JKQYJR08M', '訪看I4', 60, 89),
    ('01M5CY43AMEXN4FR51A0SYRSWD', '訪看I5', 21, 40),
    ('01M5CY43AN1ZGENC609SEDDYMG', '訪看I5・2超', 41, 60),
    ('01M5CY43AN1ZGENC609WD9P416', '予防看I2', 20, 29),
    ('01M5CY43AN1ZGENC609XEGM8QX', '予防看I3', 30, 59),
    ('01M5CY43AN1ZGENC609YXNV8C8', '予防看I4', 60, 89),
    ('01M5CY43AN1ZGENC609Z81TVGD', '予防看I5', 21, 40),
    ('01M5CY43AN1ZGENC609ZKDKFW9', '予防看I5・2超', 41, 60),
    ('01M5CY43AN1ZGENC60A06ZN94F', '医', 30, 90)
ON DUPLICATE KEY UPDATE
    code                     = VALUES(code),
    service_time_range_start = VALUES(service_time_range_start),
    service_time_range_end   = VALUES(service_time_range_end);

INSERT INTO visit_categories (id, name) VALUES
    ('01M3TC63HR6H7CP0CVRZGED7BB', '夜勤'),
    ('01M3TC64H0JJHBDMJQPGBX9FM7', '緊急'),
    ('01M3TC65G8G68GS870DAANGEBG', '入院')
ON DUPLICATE KEY UPDATE name = VALUES(name);
