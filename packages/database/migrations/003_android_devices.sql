ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_role_check;
ALTER TABLE devices ADD CONSTRAINT devices_role_check CHECK(role IN ('station','gateway','android'));
