-- 開発とテストに使うダミーの職員。実在の人と連絡先を入れない。
-- ID は、予定の API のシード（services/schedule/db/seed/seed.sql）の同じメールの職員の users.sub に入れてある。
-- org_id は、compose の上流の IdP の設定（compose/broker/upstream-idps.json）の組織の ID である。
-- 小野 拓海は止めた職員で、ログインを拒むことを確かめるのに使う。
-- 上流のアカウントは結び付けない。初回のログインで、上流の IdP のメールが確認済みで同じなら結び付ける。

INSERT INTO staff (id, org_id, email, status) VALUES
    ('01M5J20JC0TFEK223R3MF68HVK', 'org-sample', 'hina.aoki@example.com', 'active'),
    ('01M5J20JC1DAXJCPMP36TYGJ0A', 'org-sample', 'kenta.mori@example.com', 'active'),
    ('01M5J20JC21Z5PZ92E3CD6HN03', 'org-sample', 'sakura.hayashi@example.com', 'active'),
    ('01M5J20JC3D23NW9Y5WBXB8STK', 'org-sample', 'misaki.sato@example.com', 'active'),
    ('01M5J20JC4QZ0XQJD9RR1P5Z63', 'org-sample-b', 'nagisa.ueno@example.com', 'active'),
    ('01M5J20JC5R7WQ2N8K4TB6XHDE', 'org-sample-b', 'takumi.ono@example.com', 'suspended');
