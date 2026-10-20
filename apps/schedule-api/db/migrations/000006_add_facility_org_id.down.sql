ALTER TABLE facilities
    DROP INDEX uq_facilities_org_id,
    DROP COLUMN org_id;
