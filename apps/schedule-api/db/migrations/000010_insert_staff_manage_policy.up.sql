-- ADR-0006 の職員の管理の権限を入れる。職員の権限と役職を変える操作は、この権限を持つ職員だけに許す。
INSERT INTO policies (id, code, name, needs_target) VALUES
    ('01M5E5GP6Q8BQYNWN66QHJF60J', 'staff.manage', '職員の管理', FALSE);
