-- Plan 4 M1 PR #81 review — runtime Locality identity tuple.
--
-- Adds the @@unique([name, ladDistrict, country]) constraint on Locality
-- so the runtime `findExistingLocality` helper can match by tuple instead
-- of slug. Pre-fix, slug("Langley") + LAD-suffix collides with
-- slugify("Langley (Uttlesford)"), so a postcode for the bare "Langley"
-- parish could resolve to the parenthetical disambiguator's Locality row
-- (or vice versa). Tuple match by (name, ladDistrict, country) is the
-- correct identity — the seed generator already groups Localities by
-- (country, ladName, name).
--
-- Pre-flight check: verified the seed-time invariant holds against the
-- existing 16,628 rows (zero duplicates on the tuple). This constraint
-- WILL fail to apply if a future seed regeneration introduces a dup —
-- which is the defence-in-depth point.

-- CreateIndex
CREATE UNIQUE INDEX "Locality_name_ladDistrict_country_key" ON "Locality"("name", "ladDistrict", "country");
