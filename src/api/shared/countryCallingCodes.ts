// src/api/shared/countryCallingCodes.ts
//
// F4 (SEC): the set of ASSIGNED E.164 country calling codes, used to validate
// SMS_ALLOWED_COUNTRY_CODES. The allowlist matches destinations by prefix
// (phone.startsWith(code)), so a PARTIAL prefix like "+4" — which is not a real
// country code — would match the entire +40…+49 region (Germany, Poland,
// Switzerland, …). Validating each configured entry against this set rejects
// such partials while still accepting any genuine code an operator deliberately
// configures (e.g. +44, +353, +1).
//
// Source: ITU-T Recommendation E.164 country-code assignments. Geographic codes
// only — obscure non-geographic codes (satellite / global freephone, e.g. +800,
// +870, +882) are intentionally excluded as non-SMS-relevant; adding any real
// code later is safe (it only widens what an operator MAY configure). Assigned
// codes are prefix-free (no code is a prefix of another), so exact-membership
// validation + a startsWith destination match is correct.
//
// No npm dependency (e.g. libphonenumber) — this is static reference data.

export const ASSIGNED_CALLING_CODES: ReadonlySet<string> = new Set<string>([
  // Zone 1 — North American Numbering Plan. NOTE: +1 covers the WHOLE NANP
  // region (US, Canada, Caribbean), not just the USA — enable deliberately.
  '+1',

  // Zone 2 — Africa (+ a few territories)
  '+20', '+211', '+212', '+213', '+216', '+218', '+220', '+221', '+222', '+223',
  '+224', '+225', '+226', '+227', '+228', '+229', '+230', '+231', '+232', '+233',
  '+234', '+235', '+236', '+237', '+238', '+239', '+240', '+241', '+242', '+243',
  '+244', '+245', '+246', '+247', '+248', '+249', '+250', '+251', '+252', '+253',
  '+254', '+255', '+256', '+257', '+258', '+260', '+261', '+262', '+263', '+264',
  '+265', '+266', '+267', '+268', '+269', '+27', '+290', '+291', '+297', '+298',
  '+299',

  // Zone 3 — Europe
  '+30', '+31', '+32', '+33', '+34', '+350', '+351', '+352', '+353', '+354',
  '+355', '+356', '+357', '+358', '+359', '+36', '+370', '+371', '+372', '+373',
  '+374', '+375', '+376', '+377', '+378', '+379', '+380', '+381', '+382', '+383',
  '+385', '+386', '+387', '+389', '+39',

  // Zone 4 — Europe
  '+40', '+41', '+420', '+421', '+423', '+43', '+44', '+45', '+46', '+47', '+48',
  '+49',

  // Zone 5 — Central / South America
  '+500', '+501', '+502', '+503', '+504', '+505', '+506', '+507', '+508', '+509',
  '+51', '+52', '+53', '+54', '+55', '+56', '+57', '+58', '+590', '+591', '+592',
  '+593', '+594', '+595', '+596', '+597', '+598', '+599',

  // Zone 6 — South-East Asia / Oceania
  '+60', '+61', '+62', '+63', '+64', '+65', '+66', '+670', '+672', '+673', '+674',
  '+675', '+676', '+677', '+678', '+679', '+680', '+681', '+682', '+683', '+685',
  '+686', '+687', '+688', '+689', '+690', '+691', '+692',

  // Zone 7 — Russia / Kazakhstan
  '+7',

  // Zone 8 — East Asia
  '+81', '+82', '+84', '+850', '+852', '+853', '+855', '+856', '+86', '+880',
  '+886',

  // Zone 9 — West / South / Central Asia + Middle East
  '+90', '+91', '+92', '+93', '+94', '+95', '+960', '+961', '+962', '+963',
  '+964', '+965', '+966', '+967', '+968', '+970', '+971', '+972', '+973', '+974',
  '+975', '+976', '+977', '+98', '+992', '+993', '+994', '+995', '+996', '+998',
])

/** True only for a COMPLETE assigned E.164 country calling code (e.g. "+44"). */
export function isAssignedCallingCode(value: string): boolean {
  return ASSIGNED_CALLING_CODES.has(value)
}
