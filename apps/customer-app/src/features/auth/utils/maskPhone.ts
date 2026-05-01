/**
 * Masks an E.164 phone number for display on the verify-phone screen.
 * Keeps the country-code prefix and the final 2 digits visible, masks the rest.
 *
 * Examples:
 *   +447700900000  → +44••••••••00
 *   +15551234567   → +1••••••••67
 *   +19            → +19 (too short to mask meaningfully)
 *   ''             → ''
 *   undefined/null → ''
 */

// Common ITU country calling codes. Ordered by prefix length (longest first)
// so lookup picks the most specific match. Covers NANP (+1), UK (+44), EU,
// India, Ireland, and most markets Redeemo currently touches — unknown codes
// fall back to a 2-digit prefix which is safe for display.
const COUNTRY_CODES = [
  // 3-digit
  '350', '351', '352', '353', '354', '355', '356', '357', '358', '359',
  '370', '371', '372', '373', '374', '375', '376', '377', '378', '380',
  '381', '382', '385', '386', '387', '389', '420', '421', '423',
  '500', '501', '502', '503', '504', '505', '506', '507', '508', '509',
  '590', '591', '592', '593', '594', '595', '596', '597', '598', '599',
  '670', '672', '673', '674', '675', '676', '677', '678', '679', '680',
  '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692',
  '800', '808', '850', '852', '853', '855', '856', '870', '878', '880', '881',
  '882', '883', '886', '888',
  '960', '961', '962', '963', '964', '965', '966', '967', '968', '970',
  '971', '972', '973', '974', '975', '976', '977', '992', '993', '994',
  '995', '996', '998',
  // 2-digit
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43',
  '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56',
  '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84',
  '86', '90', '91', '92', '93', '94', '95', '98',
  // 1-digit
  '1', '7',
] as const

function matchCountryCode(digits: string): string | null {
  for (const code of COUNTRY_CODES) {
    if (digits.startsWith(code)) return code
  }
  return null
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  if (!phone.startsWith('+') || !/^\+\d+$/.test(phone)) return phone
  const digits = phone.slice(1)
  const code = matchCountryCode(digits)
  if (!code) return phone
  const rest = digits.slice(code.length)
  if (rest.length <= 2) return phone
  const tail = rest.slice(-2)
  const dots = '•'.repeat(Math.max(1, rest.length - 2))
  return `+${code}${dots}${tail}`
}
