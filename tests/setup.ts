// Vitest global setup (Security Stabilisation Gate — SEC-C2).
//
// The four JWT secrets + the two Stripe secrets used to have source-visible
// fallbacks (e.g. `?? 'dev-customer-secret'`) which the test suite quietly
// relied on. Those fallbacks are removed, so the suite must supply the secrets.
//
// `||=` is deliberate: it ONLY fills the gap the removed fallbacks left and
// NEVER overrides a real value already provided by the shell / CI (so the
// existing DATABASE_URL / REDIS_URL test mechanism is untouched). These are
// throwaway test values, not real secrets, and they avoid the placeholder
// markers that `requireSecret` rejects.
process.env.JWT_SECRET_CUSTOMER ||= 'test-jwt-customer-secret-0123456789abcdef'
process.env.JWT_SECRET_MERCHANT ||= 'test-jwt-merchant-secret-0123456789abcdef'
process.env.JWT_SECRET_BRANCH ||= 'test-jwt-branch-secret-0123456789abcdef'
process.env.JWT_SECRET_ADMIN ||= 'test-jwt-admin-secret-0123456789abcdef'
process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy_for_unit_tests'
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_test_dummy_for_unit_tests'
// 64-char hex (32 bytes) so the same value is valid for both consumers: the
// AES-256-GCM branch-PIN key (encryption.ts requires 64-hex) AND the admin OTP
// HMAC key (M0). Suites that need a SPECIFIC value to compute a matching HMAC
// still set it locally; this only fills the gap for suites that don't.
process.env.ENCRYPTION_KEY ||= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
