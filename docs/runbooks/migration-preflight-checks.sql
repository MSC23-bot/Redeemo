-- Migration FAIL-CLOSED preflight / postflight (rev 2026-07-19b)
--
-- SAFETY: NO PERSISTENT TARGET-SCHEMA OR DATA MUTATION. The script CREATEs and INSERTs into
-- session-local TEMPORARY tables (so it is not literally "SELECT only"), all inside a transaction
-- that ends in ROLLBACK; temp objects are session-scoped and dropped at rollback/disconnect. It
-- performs NO migration, NO change to any persistent schema object, NO write to any persistent
-- table. It embeds NO connection string or secret: the operator runs it against the target's
-- DIRECT (non-pooler) Neon endpoint with their own injected credential.
--
-- FAIL CLOSED: run with ON_ERROR_STOP so ANY assertion RAISEs and aborts psql with a non-zero exit,
-- blocking the operator's script. Wrong applied count, wrong exact pending names, any unfinished or
-- rolled-back row, ANY checksum drift, or ANY schema-object mismatch (tables, columns + exact
-- per-table column counts, NOT NULL-ness of the D65 columns, indexes by name, FK constraints by
-- name, enum values by (type,value) pair) produces an unmistakable "PREFLIGHT FAIL" exception.
-- Every scenario asserts its exact claimed schema state, both what must be PRESENT and what must
-- still be ABSENT. A clean run prints "PREFLIGHT PASS".
--
-- USAGE:
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -v scenario=staging_pre -f migration-preflight-checks.sql
--
-- The 8 scenarios and their exact expected states (M = migration-ledger, S = schema objects;
-- "earlier5" = the 5 migrations 20260629..20260709190638; "packets" = the 6 migrations
-- 20260710..20260715):
--   scenario          M applied  M pending        S earlier5   S packets
--   staging_pre       57         the 6 packets    PRESENT      ABSENT
--   staging_post      63         none             PRESENT      PRESENT
--   prod_wa_pre       52         all 11           ABSENT       ABSENT
--   prod_wa_post      57         the 6 packets    PRESENT      ABSENT
--   prod_wb_pre       57         the 6 packets    PRESENT      ABSENT
--   prod_wb_post      63         none             PRESENT      PRESENT
--   prod_single_pre   52         all 11           ABSENT       ABSENT
--   prod_single_post  63         none             PRESENT      PRESENT
--
-- The checksum set below is sha256(migration.sql) of all 63 repo migrations at origin/main
-- edfc2a1e. The object inventory below was extracted from the actual migration SQL (full read).

\set ON_ERROR_STOP on
\pset pager off

BEGIN;  -- no persistent mutation; ROLLBACK at end. Temp tables live for the transaction.

CREATE TEMP TABLE _expected_checksum(name text PRIMARY KEY, checksum text NOT NULL) ON COMMIT DROP;
INSERT INTO _expected_checksum(name, checksum) VALUES
  ('20260407183415_auth_models','09610d5ce32c25ba9b159eb00266f3eb6d231dd4e4154f73aaa11af46892d55e'),
  ('20260407183830_auth_models_fix_nullable_password','b83263aa1592ed0245f2e0eb3e9490193e7c137d8d5d72d2d74b666d285c928b'),
  ('20260407184239_merchant_branch_models','ebe1b51dba93deedb6213b56501f69a0d9809124f6cc357974c50660501b6eb6'),
  ('20260407184552_category_amenity_interest_models','306f3c84dcbda08bafe6e8123717870190dc3e44b353c23bfb378ef3e9806a19'),
  ('20260407184738_voucher_models','e24d86cda66387f225f5b177880cfcf8ef50287f48bb33259bf5a3f01c3d6409'),
  ('20260407184854_subscription_models','11e0ce432ac4f1d4e9cfdfce91980471ffa72d1b81ac9557b0d37612bc018be8'),
  ('20260407185216_social_engagement_models','508853ef8f04262a59de53a9cf16cc5f0bce90ad7be97c454b2a6d453b8411b4'),
  ('20260407185408_campaign_featured_models','e5629dc409109bac0080300e7846794c5aae89ed4baca5a22cd02b4b40d5d15f'),
  ('20260407185718_admin_operational_models','a7beb7d404c0c61ad42c8eb10bd93bebb6fa358863fe5c78f5d1f60fcaebdcc0'),
  ('20260407185900_voucher_redemption_add_code_and_validation_state','e7cdc2598759722a0b0df64cc68ba9706220a08a76f87cd5fd5f7167855fa071'),
  ('20260408083543_auth_schema_additions','170bd3c00b3106dd81d9d5360a51aafd23dff13af3f8d024533d27ac3610e2c9'),
  ('20260408224116_phase_2c_merchant_branch_voucher','aad6293eea5306424a352c67c04c886263222a1affa25ce5318e36d2a6d3567b'),
  ('20260408225552_add_composite_indexes_phase_2c','5ef0df0ea41787b0559faa549ac4eca8d6104d80bc44fd6fc567a984f4dd70c3'),
  ('20260409103416_add_promo_code_stripe_coupon_id','77585b939bf8c3a85fe370686a675a7bc1733d15e790fc6aef9fcfbe72744271'),
  ('20260409121220_add_user_stripe_customer_id','870104ef2af6126071de0b46ed1fb070a9d28daf8df061e717569b3b99eaf1c2'),
  ('20260409121334_add_stripe_webhook_event','58b9a1b7a659fb45526434e0793ba98cea54a58619244acc36d76fb86bf8b8c3'),
  ('20260410000000_rename_branch_redemption_pin','003347ca6483aed77856ca6b434eef3b65b70138375427daa008ff68396eca36'),
  ('20260411000000_phase_3c_schema_additions','0897a474b1d9bb82edf08ccbd50493fae60800491975545ab6f77de8630265f2'),
  ('20260412000001_review_report_unique_constraint','474d599d53bf453e0e852e00576b234007b1dcb7f33b634aa8aadccb27f1724f'),
  ('20260417231548_add_review_helpful','175e6ba062370e09830759a7b5a138734cd4e4509d13878c37c2faf809c03738'),
  ('20260418120000_add_cycle_anchor_date','3ab84d25165eeac3fcb856d94c9c7f04933a4f8c556753a993436edd679dccf3'),
  ('20260418130000_nullable_stripe_fields','77204d42fd064a6aab395d71622fa198917ac2dd875d456784baf1acdb0173f3'),
  ('20260423000000_add_onboarding_completion_flags','8471697aeaf674f0c2d3b4f443fee463c6f2427ded739532bfa99286cec4f300'),
  ('20260428124838_category_taxonomy','7f2aa250792f44af6a30c3d4ab7eff33f82e8b7e0ce2d0a26124405a8d2a0b3c'),
  ('20260428163710_category_name_parentid_unique','94be28cb4ef5ede3bb2dab7a9b7a989d96a66a61fed1ac1266aa76257f360737'),
  ('20260429000000_supply_aware_correction','76ce94c73270f184fcf9987dcc3fbbf8507382d429dd76c81ae93a713a7b2aa0'),
  ('20260508000323_redemption_screenshot_event','c2b17efabd3d936fff7fb41baea4e6d41cd307a31dd0ab7740c1924bc660f42c'),
  ('20260509140937_add_review_redemption_link','8b8d5a1c86aec5cfeb0237687641414a44807ecc6b7faac60548fba44e1bf8b5'),
  ('20260510033746_redemption_screenshot_event_platform_check','fa1158e26ef106fba3fd9d27f705eae3c985a1dece541beb73d03dc5752f33d4'),
  ('20260510194844_add_voucher_availability_window','0eaae2cd822219b3d7435833b752b0f1d42ea2ef27a6edf4d75314c5c4abe0dc'),
  ('20260511000700_voucher_redemption_window_unique','e3c83d21cead2ff870de44237150e279b3d93f02c0ed8ccda31c82a9c96674f5'),
  ('20260511220408_add_voucher_cooldown_seconds','edb2d5a24e05ac9077fd2b5b243cbafaef3e5800b912f47ef7e6034cd2a662a1'),
  ('20260513165729_plan_4_location_model_foundation','94c258f5e6a2900815ad4b5295a5856676cc157913d5d6d9fb278830f83771b2'),
  ('20260514121358_plan_4_m1_locality_identity_unique','4c0e05605515135b370d15df6267f37874063727ea036cdeafc9d9df911f96cb'),
  ('20260523205231_add_voucher_redemption_is_test_data','0726e964b7c95b20d6e3cca3d465ffedd299999a1e28071366cc16e76b71773c'),
  ('20260529094849_favourite_branch_additive','ef6e1ec191ea2bafd808632d25596f0fb4f6efa5b70b33555700c21a9f979f6a'),
  ('20260607191157_add_seed_test_flags','1f34ccb4f75537d3a31b0787e5b33ced72dc2fb361d7a9cd272932813d603395'),
  ('20260610193054_comms_status_queued_outbox','7331208f3b95f1d10dc8fed35b6114144da19884019c511f6bd1912c0b2ac18a'),
  ('20260610212339_photo_moderation','c554878d18841769c6784d19366a79486f10036a4f9a3f5ae1184e0d97818807'),
  ('20260611115437_merchant_membership','cada6d1c455e4192f55dafeabb00646100849689407d640c94c58436fc20fede'),
  ('20260611125716_audit_actor','082f856f5ebf28bd892678b656a9a26be3aa4f675cc559e9651f27a569bcb02c'),
  ('20260611145806_approval_actioner','907b7508bcc809eeafa0752ff107c12bfbac1b4681549d246e9010958fc11aa5'),
  ('20260612014222_drop_merchant_admin_merchantid','ae142bf496796d9984474e714120580ec6a5a2888d4a0f0cdfad82d88c755a15'),
  ('20260612144459_add_branch_deleted_at','80becc228a03bee5c38a1556b98ae0b84429ed88188477128ccff0d9815ca0f8'),
  ('20260614133754_admin_notification_support','452f68b33b1138fd63c9d8ced9db8fdc064fd9817b91169d84995a4a36588816'),
  ('20260615150037_admin_approval_last_stale_alert_at','dd7890ab3e4ddac581741a51593d94aee8b5ee1a103a6437bc8166e7d8bc2525'),
  ('20260620022513_merchant_email_verified','49329d562f69fed1d231701a556fc0f1895a95cb8637e124598161baa93b370c'),
  ('20260622223003_merchant_membership_can_manage_vouchers','ce1704d50858be84d60bf13b07cebdfa222bcfb443d0719675c63e081dd05191'),
  ('20260624130746_branch_opening_hours_pending','7a3b094490fff2900fcaccf5113afc80c767a640141f8ed2e0e8e77e019f75ff'),
  ('20260624152859_branch_lifecycle','e4455d4a6dd69577f44a19da63cb6fd1465c2bc3bd19cd3db92bbdc5b8d4e078'),
  ('20260624183015_branch_redemption_alerts_enabled','af44084ee4be82bd1aae7f3e926e4fa976ba8baa2da9396e3b8223858028d172'),
  ('20260624190418_branch_opening_hours_multi_window','c76bd049f1dd46fa8c9479cb738991db6b768903716ef0e890b115a9edbac4d2'),
  ('20260629000000_keyring_fingerprint','162d511e37d35d73781762fb8e01f02e41026be272e4766a055d3b4ba325b731'),
  ('20260702000000_maintenance_alert_types','338cf4c862811543c6a6f9fb2fd884e1bbc4a40128ee3688b251d11287b3d9db'),
  ('20260707135148_voucher_governed_flows','02cebf5f134c451b823ac8db2c50888588a93773a405b84e5af84c3f499c2507'),
  ('20260709095646_branch_google_place_id','a517b654678b530ec137a1dae4e2186c33369a98fd33129dca4b972aa492e322'),
  ('20260709190638_branch_merchant_confirmed_confidence','ea59fea2da735d0e6080a9c05f69dcee547be5c88f7a2468707a422f4db8ff09'),
  ('20260710000000_admin_capability_grants_field_role','2e562d7f6d7eb3199c4c14bcc95dfd3ebb59b09937378fa7faddd68dc0665f14'),
  ('20260712000000_merchant_lead_packet','50b647088bdf98b3f43dd3871dbcb31d51985aca9b79987b70148c39bc3ebeef'),
  ('20260713000000_merchant_note_packet','a16e81c108c0845cbf66678a14f331b84b2a4056832ca768f48ce9501832a24a'),
  ('20260714000000_d65_merchant_agreement_record','d0da24c391fc08211fd55db0a60e772b2652e6dd570ea4214e09acc0683b63c7'),
  ('20260714210000_customer_invite_referral_packet','5ce4a0b658b7e72815e16d505c683f941b85557de42b19ec84aad40ffbab480c'),
  ('20260715000000_d65_agreement_reviewed_body','4ac5153399c07aa148b609beed97c4ea65d2488111cabe03103ae59353439e81');

-- Schema-object inventory: FULL DEFINITION IDENTITIES, generated from a ground-truth build of the
-- real 63 migration files on disposable PostgreSQL 16 (not hand-transcribed). grp = earlier5|packet.
-- Columns: (grp, table, column, type[:udt for enums], is_nullable, column_default or '<none>').
-- A renamed, re-typed, re-nulled or re-defaulted column no longer matches its identity row -> FAIL.
CREATE TEMP TABLE _exp_col(grp text, tbl text, col text, typ text, nullable text, def text) ON COMMIT DROP;
INSERT INTO _exp_col VALUES
  ('packet','AdminCapabilityGrant','id','text','NO','<none>'),
  ('packet','AdminCapabilityGrant','adminUserId','text','NO','<none>'),
  ('packet','AdminCapabilityGrant','capability','text','NO','<none>'),
  ('packet','AdminCapabilityGrant','grantedById','text','NO','<none>'),
  ('packet','AdminCapabilityGrant','grantedAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('packet','AdminCapabilityGrant','revokedAt','timestamp without time zone','YES','<none>'),
  ('packet','AdminCapabilityGrant','revokedById','text','YES','<none>'),
  ('earlier5','Branch','googlePlaceId','text','YES','<none>'),
  ('packet','BusinessSuppression','id','text','NO','<none>'),
  ('packet','BusinessSuppression','placeKey','text','NO','<none>'),
  ('packet','BusinessSuppression','reason','USER-DEFINED:BusinessSuppressionReason','NO','<none>'),
  ('packet','BusinessSuppression','createdByAdminId','text','YES','<none>'),
  ('packet','BusinessSuppression','createdAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('packet','InviteRewardGrant','id','text','NO','<none>'),
  ('packet','InviteRewardGrant','inviteId','text','NO','<none>'),
  ('packet','InviteRewardGrant','userId','text','NO','<none>'),
  ('packet','InviteRewardGrant','merchantId','text','NO','<none>'),
  ('packet','InviteRewardGrant','entitlementMonths','integer','NO','1'),
  ('packet','InviteRewardGrant','status','USER-DEFINED:InviteRewardGrantStatus','NO','''PENDING''::"InviteRewardGrantStatus"'),
  ('packet','InviteRewardGrant','voidReason','text','YES','<none>'),
  ('packet','InviteRewardGrant','issuedAt','timestamp without time zone','YES','<none>'),
  ('packet','InviteRewardGrant','consumedAt','timestamp without time zone','YES','<none>'),
  ('packet','InviteRewardGrant','createdAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('earlier5','KeyringFingerprint','id','text','NO','<none>'),
  ('earlier5','KeyringFingerprint','service','text','NO','<none>'),
  ('earlier5','KeyringFingerprint','fingerprint','text','NO','<none>'),
  ('earlier5','KeyringFingerprint','codeCapability','text','NO','<none>'),
  ('earlier5','KeyringFingerprint','bootedAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('earlier5','KeyringFingerprint','lastSeenAt','timestamp without time zone','NO','<none>'),
  ('packet','MerchantAgreementRecord','id','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','merchantId','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','agreementVersion','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','contentHash','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','signerName','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','signerRoleConfirmation','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','actorAdminId','text','YES','<none>'),
  ('packet','MerchantAgreementRecord','witnessName','text','YES','<none>'),
  ('packet','MerchantAgreementRecord','witnessEmail','text','YES','<none>'),
  ('packet','MerchantAgreementRecord','method','USER-DEFINED:AgreementSignMethod','NO','<none>'),
  ('packet','MerchantAgreementRecord','signedAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('packet','MerchantAgreementRecord','ipAddress','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','userAgent','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','pdfKey','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','drawnSignatureKey','text','YES','<none>'),
  ('packet','MerchantAgreementRecord','reviewedContentHash','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','reviewedBody','text','NO','<none>'),
  ('packet','MerchantAgreementRecord','pdfHash','text','NO','<none>'),
  ('packet','MerchantInvite','id','text','NO','<none>'),
  ('packet','MerchantInvite','inviterUserId','text','YES','<none>'),
  ('packet','MerchantInvite','inviterKey','text','YES','<none>'),
  ('packet','MerchantInvite','inviterEmailNorm','text','YES','<none>'),
  ('packet','MerchantInvite','placeKey','text','NO','<none>'),
  ('packet','MerchantInvite','googlePlaceId','text','YES','<none>'),
  ('packet','MerchantInvite','businessNameRaw','text','NO','<none>'),
  ('packet','MerchantInvite','localityRaw','text','YES','<none>'),
  ('packet','MerchantInvite','note','text','YES','<none>'),
  ('packet','MerchantInvite','consentShareName','boolean','NO','false'),
  ('packet','MerchantInvite','status','USER-DEFINED:MerchantInviteStatus','NO','''ACTIVE''::"MerchantInviteStatus"'),
  ('packet','MerchantInvite','rewardEligible','boolean','NO','false'),
  ('packet','MerchantInvite','countableAt','timestamp without time zone','YES','<none>'),
  ('packet','MerchantInvite','leadId','text','YES','<none>'),
  ('packet','MerchantInvite','ipHash','text','YES','<none>'),
  ('packet','MerchantInvite','anonymisedAt','timestamp without time zone','YES','<none>'),
  ('packet','MerchantInvite','createdAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('packet','MerchantInvite','updatedAt','timestamp without time zone','NO','<none>'),
  ('packet','MerchantLead','id','text','NO','<none>'),
  ('packet','MerchantLead','businessName','text','NO','<none>'),
  ('packet','MerchantLead','categoryGuess','text','YES','<none>'),
  ('packet','MerchantLead','locationHint','text','YES','<none>'),
  ('packet','MerchantLead','contactName','text','YES','<none>'),
  ('packet','MerchantLead','contactEmail','text','YES','<none>'),
  ('packet','MerchantLead','contactPhone','text','YES','<none>'),
  ('packet','MerchantLead','source','USER-DEFINED:MerchantSource','YES','<none>'),
  ('packet','MerchantLead','stage','USER-DEFINED:LeadStage','NO','''LEAD''::"LeadStage"'),
  ('packet','MerchantLead','nextAction','text','YES','<none>'),
  ('packet','MerchantLead','dueDate','timestamp without time zone','YES','<none>'),
  ('packet','MerchantLead','assignedRepId','text','YES','<none>'),
  ('packet','MerchantLead','lostReason','text','YES','<none>'),
  ('packet','MerchantLead','convertedMerchantId','text','YES','<none>'),
  ('packet','MerchantLead','lastActivityAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('packet','MerchantLead','anonymisedAt','timestamp without time zone','YES','<none>'),
  ('packet','MerchantLead','createdAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('packet','MerchantLead','updatedAt','timestamp without time zone','NO','<none>'),
  ('packet','MerchantNote','id','text','NO','<none>'),
  ('packet','MerchantNote','merchantId','text','NO','<none>'),
  ('packet','MerchantNote','authorAdminId','text','NO','<none>'),
  ('packet','MerchantNote','body','text','NO','<none>'),
  ('packet','MerchantNote','status','USER-DEFINED:MerchantNoteStatus','NO','''ACTIVE''::"MerchantNoteStatus"'),
  ('packet','MerchantNote','editedAt','timestamp without time zone','YES','<none>'),
  ('packet','MerchantNote','retractedById','text','YES','<none>'),
  ('packet','MerchantNote','retractedAt','timestamp without time zone','YES','<none>'),
  ('packet','MerchantNote','retractedReason','text','YES','<none>'),
  ('packet','MerchantNote','createdAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('packet','MerchantNote','updatedAt','timestamp without time zone','NO','<none>'),
  ('packet','MerchantNoteEvent','id','text','NO','<none>'),
  ('packet','MerchantNoteEvent','noteId','text','NO','<none>'),
  ('packet','MerchantNoteEvent','action','USER-DEFINED:MerchantNoteAction','NO','<none>'),
  ('packet','MerchantNoteEvent','actorAdminId','text','NO','<none>'),
  ('packet','MerchantNoteEvent','priorBody','text','YES','<none>'),
  ('packet','MerchantNoteEvent','reason','text','YES','<none>'),
  ('packet','MerchantNoteEvent','createdAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('earlier5','VoucherPendingEdit','id','text','NO','<none>'),
  ('earlier5','VoucherPendingEdit','voucherId','text','NO','<none>'),
  ('earlier5','VoucherPendingEdit','merchantId','text','NO','<none>'),
  ('earlier5','VoucherPendingEdit','kind','USER-DEFINED:VoucherEditKind','NO','<none>'),
  ('earlier5','VoucherPendingEdit','proposedChanges','jsonb','YES','<none>'),
  ('earlier5','VoucherPendingEdit','reason','text','YES','<none>'),
  ('earlier5','VoucherPendingEdit','status','USER-DEFINED:PendingEditStatus','NO','''PENDING''::"PendingEditStatus"'),
  ('earlier5','VoucherPendingEdit','reviewedBy','text','YES','<none>'),
  ('earlier5','VoucherPendingEdit','reviewNote','text','YES','<none>'),
  ('earlier5','VoucherPendingEdit','createdAt','timestamp without time zone','NO','CURRENT_TIMESTAMP'),
  ('earlier5','VoucherPendingEdit','reviewedAt','timestamp without time zone','YES','<none>');

-- Index DEFINITIONS (pg_indexes.indexdef, ground-truth generated). Same-name wrong-definition
-- (e.g. unique swapped for non-unique, different column list) no longer matches -> FAIL.
CREATE TEMP TABLE _exp_idx(grp text, idx text, def text) ON COMMIT DROP;
INSERT INTO _exp_idx VALUES
  ('packet','AdminCapabilityGrant_adminUserId_revokedAt_idx','CREATE INDEX "AdminCapabilityGrant_adminUserId_revokedAt_idx" ON public."AdminCapabilityGrant" USING btree ("adminUserId", "revokedAt")'),
  ('packet','AdminCapabilityGrant_capability_idx','CREATE INDEX "AdminCapabilityGrant_capability_idx" ON public."AdminCapabilityGrant" USING btree (capability)'),
  ('packet','BusinessSuppression_placeKey_key','CREATE UNIQUE INDEX "BusinessSuppression_placeKey_key" ON public."BusinessSuppression" USING btree ("placeKey")'),
  ('packet','InviteRewardGrant_inviteId_key','CREATE UNIQUE INDEX "InviteRewardGrant_inviteId_key" ON public."InviteRewardGrant" USING btree ("inviteId")'),
  ('packet','InviteRewardGrant_merchantId_idx','CREATE INDEX "InviteRewardGrant_merchantId_idx" ON public."InviteRewardGrant" USING btree ("merchantId")'),
  ('packet','InviteRewardGrant_status_idx','CREATE INDEX "InviteRewardGrant_status_idx" ON public."InviteRewardGrant" USING btree (status)'),
  ('packet','InviteRewardGrant_userId_idx','CREATE INDEX "InviteRewardGrant_userId_idx" ON public."InviteRewardGrant" USING btree ("userId")'),
  ('earlier5','KeyringFingerprint_service_key','CREATE UNIQUE INDEX "KeyringFingerprint_service_key" ON public."KeyringFingerprint" USING btree (service)'),
  ('packet','MerchantAgreementRecord_merchantId_idx','CREATE INDEX "MerchantAgreementRecord_merchantId_idx" ON public."MerchantAgreementRecord" USING btree ("merchantId")'),
  ('packet','MerchantInvite_anonymisedAt_createdAt_idx','CREATE INDEX "MerchantInvite_anonymisedAt_createdAt_idx" ON public."MerchantInvite" USING btree ("anonymisedAt", "createdAt")'),
  ('packet','MerchantInvite_inviterKey_placeKey_key','CREATE UNIQUE INDEX "MerchantInvite_inviterKey_placeKey_key" ON public."MerchantInvite" USING btree ("inviterKey", "placeKey")'),
  ('packet','MerchantInvite_inviterUserId_idx','CREATE INDEX "MerchantInvite_inviterUserId_idx" ON public."MerchantInvite" USING btree ("inviterUserId")'),
  ('packet','MerchantInvite_leadId_idx','CREATE INDEX "MerchantInvite_leadId_idx" ON public."MerchantInvite" USING btree ("leadId")'),
  ('packet','MerchantInvite_placeKey_idx','CREATE INDEX "MerchantInvite_placeKey_idx" ON public."MerchantInvite" USING btree ("placeKey")'),
  ('packet','MerchantInvite_status_idx','CREATE INDEX "MerchantInvite_status_idx" ON public."MerchantInvite" USING btree (status)'),
  ('packet','MerchantLead_anonymisedAt_lastActivityAt_idx','CREATE INDEX "MerchantLead_anonymisedAt_lastActivityAt_idx" ON public."MerchantLead" USING btree ("anonymisedAt", "lastActivityAt")'),
  ('packet','MerchantLead_assignedRepId_idx','CREATE INDEX "MerchantLead_assignedRepId_idx" ON public."MerchantLead" USING btree ("assignedRepId")'),
  ('packet','MerchantLead_dueDate_idx','CREATE INDEX "MerchantLead_dueDate_idx" ON public."MerchantLead" USING btree ("dueDate")'),
  ('packet','MerchantLead_stage_idx','CREATE INDEX "MerchantLead_stage_idx" ON public."MerchantLead" USING btree (stage)'),
  ('packet','MerchantNoteEvent_noteId_createdAt_idx','CREATE INDEX "MerchantNoteEvent_noteId_createdAt_idx" ON public."MerchantNoteEvent" USING btree ("noteId", "createdAt")'),
  ('packet','MerchantNote_merchantId_createdAt_idx','CREATE INDEX "MerchantNote_merchantId_createdAt_idx" ON public."MerchantNote" USING btree ("merchantId", "createdAt")'),
  ('earlier5','VoucherPendingEdit_merchantId_status_idx','CREATE INDEX "VoucherPendingEdit_merchantId_status_idx" ON public."VoucherPendingEdit" USING btree ("merchantId", status)'),
  ('earlier5','VoucherPendingEdit_voucherId_status_idx','CREATE INDEX "VoucherPendingEdit_voucherId_status_idx" ON public."VoucherPendingEdit" USING btree ("voucherId", status)');

-- FK DEFINITIONS: (grp, constraint, table, fk column, referenced table, update_rule, delete_rule).
-- Same-name wrong-behaviour (e.g. ON DELETE CASCADE instead of RESTRICT) no longer matches -> FAIL.
CREATE TEMP TABLE _exp_fkdef(grp text, con text, tbl text, col text, reftbl text, upd text, del text) ON COMMIT DROP;
INSERT INTO _exp_fkdef VALUES
  ('packet','AdminCapabilityGrant_adminUserId_fkey','AdminCapabilityGrant','adminUserId','AdminUser','CASCADE','RESTRICT'),
  ('packet','MerchantAgreementRecord_merchantId_fkey','MerchantAgreementRecord','merchantId','Merchant','CASCADE','RESTRICT'),
  ('packet','MerchantNoteEvent_noteId_fkey','MerchantNoteEvent','noteId','MerchantNote','CASCADE','RESTRICT'),
  ('packet','MerchantNote_merchantId_fkey','MerchantNote','merchantId','Merchant','CASCADE','RESTRICT'),
  ('earlier5','VoucherPendingEdit_merchantId_fkey','VoucherPendingEdit','merchantId','Merchant','CASCADE','RESTRICT'),
  ('earlier5','VoucherPendingEdit_voucherId_fkey','VoucherPendingEdit','voucherId','Voucher','CASCADE','RESTRICT');

CREATE TEMP TABLE _exp_enum(grp text, typ text, val text) ON COMMIT DROP;
INSERT INTO _exp_enum VALUES
  ('earlier5','VoucherEditKind','CHANGE'), ('earlier5','VoucherEditKind','END'),
  ('earlier5','NotificationType','ADMIN_MAINTENANCE_DEGRADED'),
  ('earlier5','NotificationType','ADMIN_MAINTENANCE_RECOVERED'),
  ('earlier5','ApprovalStatus','WITHDRAWN'),
  ('earlier5','ApprovalType','VOUCHER_EDIT'),
  ('earlier5','LocationConfidence','MERCHANT_CONFIRMED'),
  ('packet','AdminRole','FIELD'),
  ('packet','MerchantSource','REP_VISIT'), ('packet','MerchantSource','INBOUND_ENQUIRY'),
  ('packet','MerchantSource','PHONE'), ('packet','MerchantSource','SOCIAL'),
  ('packet','MerchantSource','EMAIL_CAMPAIGN'), ('packet','MerchantSource','CUSTOMER_REQUEST'),
  ('packet','LeadStage','LEAD'), ('packet','LeadStage','CONTACTED'),
  ('packet','LeadStage','VISIT_BOOKED'), ('packet','LeadStage','CONVERTED'), ('packet','LeadStage','LOST'),
  ('packet','MerchantNoteStatus','ACTIVE'), ('packet','MerchantNoteStatus','RETRACTED'),
  ('packet','MerchantNoteAction','ADDED'), ('packet','MerchantNoteAction','EDITED'),
  ('packet','MerchantNoteAction','RETRACTED'),
  ('packet','AgreementSignMethod','IN_PERSON_ASSISTED'), ('packet','AgreementSignMethod','SELF_SERVE_CLICK'),
  ('packet','MerchantInviteStatus','PENDING_CONFIRM'), ('packet','MerchantInviteStatus','ACTIVE'),
  ('packet','MerchantInviteStatus','HELD_REVIEW'),
  ('packet','InviteRewardGrantStatus','PENDING'), ('packet','InviteRewardGrantStatus','ISSUED'),
  ('packet','InviteRewardGrantStatus','CONSUMED'), ('packet','InviteRewardGrantStatus','VOIDED'),
  ('packet','BusinessSuppressionReason','OPT_OUT'), ('packet','BusinessSuppressionReason','IGNORED'),
  ('packet','BusinessSuppressionReason','MANUAL');

-- Columns added to PRE-EXISTING tables (asserted by presence, not count: the host table has other columns).
CREATE TEMP TABLE _exp_addedcol(grp text, tbl text, col text) ON COMMIT DROP;
INSERT INTO _exp_addedcol VALUES ('earlier5','Branch','googlePlaceId');

CREATE TEMP TABLE _scenario(key text) ON COMMIT DROP;
INSERT INTO _scenario(key) VALUES (:'scenario');

DO $preflight$
DECLARE
  v_scenario  text;
  v_applied   int;
  v_exp_appl  int;
  v_e5_state  text;  -- 'present' | 'absent'
  v_pk_state  text;  -- 'present' | 'absent'
  v_bad       int;
  v_expected  int;
  v_example   text;
  v_pending   text[];
  v_exp_pend  text[];
  rec         record;
  c_packets   text[] := ARRAY[
    '20260710000000_admin_capability_grants_field_role',
    '20260712000000_merchant_lead_packet',
    '20260713000000_merchant_note_packet',
    '20260714000000_d65_merchant_agreement_record',
    '20260714210000_customer_invite_referral_packet',
    '20260715000000_d65_agreement_reviewed_body'];
  c_earlier5  text[] := ARRAY[
    '20260629000000_keyring_fingerprint',
    '20260702000000_maintenance_alert_types',
    '20260707135148_voucher_governed_flows',
    '20260709095646_branch_google_place_id',
    '20260709190638_branch_merchant_confirmed_confidence'];
  c_all11     text[];
BEGIN
  c_all11 := c_earlier5 || c_packets;
  SELECT key INTO v_scenario FROM _scenario;
  IF v_scenario IS NULL OR v_scenario = '' THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: no scenario provided. Run with -v scenario=<staging_pre|staging_post|prod_wa_pre|prod_wa_post|prod_wb_pre|prod_wb_post|prod_single_pre|prod_single_post>';
  END IF;

  -- Scenario -> expected ledger + schema-group states.
  CASE v_scenario
    WHEN 'staging_pre'      THEN v_exp_appl := 57; v_exp_pend := c_packets;        v_e5_state := 'present'; v_pk_state := 'absent';
    WHEN 'staging_post'     THEN v_exp_appl := 63; v_exp_pend := ARRAY[]::text[];  v_e5_state := 'present'; v_pk_state := 'present';
    WHEN 'prod_wa_pre'      THEN v_exp_appl := 52; v_exp_pend := c_all11;          v_e5_state := 'absent';  v_pk_state := 'absent';
    WHEN 'prod_wa_post'     THEN v_exp_appl := 57; v_exp_pend := c_packets;        v_e5_state := 'present'; v_pk_state := 'absent';
    WHEN 'prod_wb_pre'      THEN v_exp_appl := 57; v_exp_pend := c_packets;        v_e5_state := 'present'; v_pk_state := 'absent';
    WHEN 'prod_wb_post'     THEN v_exp_appl := 63; v_exp_pend := ARRAY[]::text[];  v_e5_state := 'present'; v_pk_state := 'present';
    WHEN 'prod_single_pre'  THEN v_exp_appl := 52; v_exp_pend := c_all11;          v_e5_state := 'absent';  v_pk_state := 'absent';
    WHEN 'prod_single_post' THEN v_exp_appl := 63; v_exp_pend := ARRAY[]::text[];  v_e5_state := 'present'; v_pk_state := 'present';
    ELSE RAISE EXCEPTION 'PREFLIGHT FAIL: unknown scenario %', v_scenario;
  END CASE;

  -- ============ MIGRATION-LEDGER CHECKS ============

  -- (1) No unfinished migrations (partial-apply gate F2).
  SELECT count(*) INTO v_bad FROM "_prisma_migrations" WHERE finished_at IS NULL;
  IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % UNFINISHED migration(s): partial apply, DO NOT DEPLOY BACKEND', v_bad; END IF;

  -- (2) No rolled-back migrations.
  SELECT count(*) INTO v_bad FROM "_prisma_migrations" WHERE rolled_back_at IS NOT NULL;
  IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % ROLLED-BACK migration(s)', v_bad; END IF;

  -- (3) Every applied migration must be in the expected repo-63 set (no unknown/extra).
  SELECT count(*) INTO v_bad FROM "_prisma_migrations" m
    WHERE m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM _expected_checksum e WHERE e.name = m.migration_name);
  IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % applied migration(s) NOT in the expected repo-63 set', v_bad; END IF;

  -- (4) CHECKSUM drift: every applied row's checksum must equal the repo sha256. NULL checksums fail.
  SELECT count(*) INTO v_bad FROM "_prisma_migrations" m
    JOIN _expected_checksum e ON e.name = m.migration_name
    WHERE m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL
      AND (m.checksum IS NULL OR m.checksum <> e.checksum);
  IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % applied migration(s) have CHECKSUM DRIFT (file edited after apply): migrate deploy will abort', v_bad; END IF;

  -- (5) Applied count matches the scenario.
  SELECT count(*) INTO v_applied FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  IF v_applied <> v_exp_appl THEN RAISE EXCEPTION 'PREFLIGHT FAIL: applied=% but scenario % expects %', v_applied, v_scenario, v_exp_appl; END IF;

  -- (6) Exact PENDING name-set (repo-63 minus applied) equals the scenario's expectation.
  SELECT coalesce(array_agg(e.name ORDER BY e.name), ARRAY[]::text[]) INTO v_pending
    FROM _expected_checksum e
    WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" m
                      WHERE m.migration_name = e.name AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL);
  IF NOT (v_pending @> v_exp_pend AND v_pending <@ v_exp_pend) THEN
    RAISE EXCEPTION 'PREFLIGHT FAIL: pending set mismatch. actual=% expected=%', v_pending, (SELECT array_agg(x ORDER BY x) FROM unnest(v_exp_pend) x);
  END IF;

  -- ============ SCHEMA-OBJECT CHECKS (definition IDENTITY, not counts/names) ============
  -- 'Branch' is excluded from table-existence/extra-column checks (pre-existing host table);
  -- its googlePlaceId column is asserted via its identity row in _exp_col.

  -- ---- earlier5 assertions ----
  IF v_e5_state = 'present' THEN
    -- (a) Every expected column identity (name+type+nullability+default) must match exactly.
    SELECT count(*), min(e.tbl || '.' || e.col) INTO v_bad, v_example FROM _exp_col e
      WHERE e.grp='earlier5' AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=e.tbl AND c.column_name=e.col
          AND c.data_type || CASE WHEN c.data_type='USER-DEFINED' THEN ':'||c.udt_name ELSE '' END = e.typ
          AND c.is_nullable = e.nullable AND coalesce(c.column_default,'<none>') = e.def);
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % earlier5 column identity mismatch(es), e.g. % (renamed/missing/wrong type/null/default)', v_bad, v_example; END IF;
    -- (b) No EXTRA columns on the window-created tables (exact column-set equality).
    FOR rec IN SELECT tbl, count(*) AS expected FROM _exp_col WHERE grp='earlier5' AND tbl <> 'Branch' GROUP BY tbl LOOP
      SELECT count(*) INTO v_bad FROM information_schema.columns WHERE table_schema='public' AND table_name=rec.tbl;
      IF v_bad <> rec.expected THEN RAISE EXCEPTION 'PREFLIGHT FAIL: earlier5 table % has % columns, expected % (extra/missing column)', rec.tbl, v_bad, rec.expected; END IF;
    END LOOP;
    -- (c) Index DEFINITIONS exact (name + full indexdef).
    SELECT count(*), min(x.idx) INTO v_bad, v_example FROM _exp_idx x
      WHERE x.grp='earlier5' AND NOT EXISTS (
        SELECT 1 FROM pg_indexes i WHERE i.schemaname='public' AND i.indexname=x.idx AND i.indexdef=x.def);
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % earlier5 index definition mismatch(es), e.g. % (missing or same-name-wrong-definition)', v_bad, v_example; END IF;
    -- (d) FK DEFINITIONS exact (name + table + column + referenced table + update/delete rules).
    SELECT count(*), min(f.con) INTO v_bad, v_example FROM _exp_fkdef f
      WHERE f.grp='earlier5' AND NOT EXISTS (
        SELECT 1 FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=rc.constraint_name AND kcu.constraint_schema='public'
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=rc.constraint_name AND ccu.constraint_schema='public'
        WHERE rc.constraint_schema='public' AND rc.constraint_name=f.con AND kcu.table_name=f.tbl
          AND kcu.column_name=f.col AND ccu.table_name=f.reftbl AND rc.update_rule=f.upd AND rc.delete_rule=f.del);
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % earlier5 FK definition mismatch(es), e.g. % (missing or same-name-wrong-behaviour)', v_bad, v_example; END IF;
    -- (e) Enum (type,value) pairs all present.
    SELECT count(*) INTO v_bad FROM _exp_enum x JOIN pg_type t ON t.typname=x.typ JOIN pg_enum e ON e.enumtypid=t.oid AND e.enumlabel=x.val WHERE x.grp='earlier5';
    SELECT count(*) INTO v_expected FROM _exp_enum WHERE grp='earlier5';
    IF v_bad <> v_expected THEN RAISE EXCEPTION 'PREFLIGHT FAIL: earlier5 enum values present %/%', v_bad, v_expected; END IF;
  ELSE
    FOR rec IN SELECT DISTINCT tbl FROM _exp_col WHERE grp='earlier5' AND tbl <> 'Branch' LOOP
      IF to_regclass('public.' || quote_ident(rec.tbl)) IS NOT NULL THEN RAISE EXCEPTION 'PREFLIGHT FAIL: earlier5 table % already EXISTS (drift/partial apply)', rec.tbl; END IF;
    END LOOP;
    -- No earlier5 column may exist yet (covers Branch.googlePlaceId).
    SELECT count(*) INTO v_bad FROM _exp_col e JOIN information_schema.columns c
      ON c.table_schema='public' AND c.table_name=e.tbl AND c.column_name=e.col WHERE e.grp='earlier5';
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % earlier5 column(s) already exist (drift)', v_bad; END IF;
    SELECT count(*) INTO v_bad FROM _exp_enum x JOIN pg_type t ON t.typname=x.typ JOIN pg_enum e ON e.enumtypid=t.oid AND e.enumlabel=x.val WHERE x.grp='earlier5';
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % earlier5 enum value(s) already exist (drift)', v_bad; END IF;
    SELECT count(*) INTO v_bad FROM _exp_idx x JOIN pg_indexes i ON i.schemaname='public' AND i.indexname=x.idx WHERE x.grp='earlier5';
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % earlier5 index(es) already exist (drift)', v_bad; END IF;
  END IF;

  -- ---- packet assertions ----
  IF v_pk_state = 'present' THEN
    SELECT count(*), min(e.tbl || '.' || e.col) INTO v_bad, v_example FROM _exp_col e
      WHERE e.grp='packet' AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=e.tbl AND c.column_name=e.col
          AND c.data_type || CASE WHEN c.data_type='USER-DEFINED' THEN ':'||c.udt_name ELSE '' END = e.typ
          AND c.is_nullable = e.nullable AND coalesce(c.column_default,'<none>') = e.def);
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % packet column identity mismatch(es), e.g. % (renamed/missing/wrong type/null/default)', v_bad, v_example; END IF;
    FOR rec IN SELECT tbl, count(*) AS expected FROM _exp_col WHERE grp='packet' GROUP BY tbl LOOP
      SELECT count(*) INTO v_bad FROM information_schema.columns WHERE table_schema='public' AND table_name=rec.tbl;
      IF v_bad <> rec.expected THEN RAISE EXCEPTION 'PREFLIGHT FAIL: packet table % has % columns, expected % (extra/missing column)', rec.tbl, v_bad, rec.expected; END IF;
    END LOOP;
    -- D65 belt (redundant with identity rows; kept as an explicit, named legal-column gate).
    SELECT count(*) INTO v_bad FROM information_schema.columns
      WHERE table_schema='public' AND table_name='MerchantAgreementRecord'
        AND column_name IN ('reviewedContentHash','reviewedBody','pdfHash') AND is_nullable='NO';
    IF v_bad <> 3 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: D65 columns present-and-NOT-NULL = %/3', v_bad; END IF;
    SELECT count(*), min(x.idx) INTO v_bad, v_example FROM _exp_idx x
      WHERE x.grp='packet' AND NOT EXISTS (
        SELECT 1 FROM pg_indexes i WHERE i.schemaname='public' AND i.indexname=x.idx AND i.indexdef=x.def);
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % packet index definition mismatch(es), e.g. % (missing or same-name-wrong-definition)', v_bad, v_example; END IF;
    SELECT count(*), min(f.con) INTO v_bad, v_example FROM _exp_fkdef f
      WHERE f.grp='packet' AND NOT EXISTS (
        SELECT 1 FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=rc.constraint_name AND kcu.constraint_schema='public'
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=rc.constraint_name AND ccu.constraint_schema='public'
        WHERE rc.constraint_schema='public' AND rc.constraint_name=f.con AND kcu.table_name=f.tbl
          AND kcu.column_name=f.col AND ccu.table_name=f.reftbl AND rc.update_rule=f.upd AND rc.delete_rule=f.del);
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % packet FK definition mismatch(es), e.g. % (missing or same-name-wrong-behaviour)', v_bad, v_example; END IF;
    SELECT count(*) INTO v_bad FROM _exp_enum x JOIN pg_type t ON t.typname=x.typ JOIN pg_enum e ON e.enumtypid=t.oid AND e.enumlabel=x.val WHERE x.grp='packet';
    SELECT count(*) INTO v_expected FROM _exp_enum WHERE grp='packet';
    IF v_bad <> v_expected THEN RAISE EXCEPTION 'PREFLIGHT FAIL: packet enum values present %/%', v_bad, v_expected; END IF;
  ELSE
    FOR rec IN SELECT DISTINCT tbl FROM _exp_col WHERE grp='packet' LOOP
      IF to_regclass('public.' || quote_ident(rec.tbl)) IS NOT NULL THEN RAISE EXCEPTION 'PREFLIGHT FAIL: packet table % already EXISTS before the packet apply (drift/partial apply)', rec.tbl; END IF;
    END LOOP;
    SELECT count(*) INTO v_bad FROM _exp_enum x JOIN pg_type t ON t.typname=x.typ JOIN pg_enum e ON e.enumtypid=t.oid AND e.enumlabel=x.val WHERE x.grp='packet';
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % packet enum value(s) already exist before the packet apply (drift)', v_bad; END IF;
    SELECT count(*) INTO v_bad FROM _exp_idx x JOIN pg_indexes i ON i.schemaname='public' AND i.indexname=x.idx WHERE x.grp='packet';
    IF v_bad > 0 THEN RAISE EXCEPTION 'PREFLIGHT FAIL: % packet index(es) already exist before the packet apply (drift)', v_bad; END IF;
  END IF;

  RAISE NOTICE 'PREFLIGHT PASS: scenario=% applied=% pending=% earlier5=% packets=% unfinished=0 rolled_back=0 checksums OK schema OK',
    v_scenario, v_applied, coalesce(array_length(v_pending,1),0), v_e5_state, v_pk_state;
END
$preflight$;

ROLLBACK;
