// ITU dial-code list for the phone-entry country picker.
// `nationalLength` + `stripTrunk` are only set for markets we've explicitly validated.
// Countries without them fall back to the generic E.164 check (8–15 digits).
//
// Kept in alpha-order by name for the picker. UK is also pinned to the top of the picker
// at render time (not here) — this list is a data source, not a sort order.

export type Country = {
  code: string // ISO alpha-2
  name: string
  dial: string // e.g. '+44'
  flag: string // unicode flag
  example?: string // national-number placeholder (without trunk 0)
  nationalLength?: number // exact expected digit count after stripping trunk '0'
  stripTrunk?: boolean // strip a single leading '0' before composing E.164
}

export const COUNTRIES: Country[] = [
  { code: 'AF', name: 'Afghanistan',            dial: '+93',   flag: '🇦🇫' },
  { code: 'AL', name: 'Albania',                dial: '+355',  flag: '🇦🇱' },
  { code: 'DZ', name: 'Algeria',                dial: '+213',  flag: '🇩🇿' },
  { code: 'AS', name: 'American Samoa',         dial: '+1684', flag: '🇦🇸' },
  { code: 'AD', name: 'Andorra',                dial: '+376',  flag: '🇦🇩' },
  { code: 'AO', name: 'Angola',                 dial: '+244',  flag: '🇦🇴' },
  { code: 'AI', name: 'Anguilla',               dial: '+1264', flag: '🇦🇮' },
  { code: 'AG', name: 'Antigua and Barbuda',    dial: '+1268', flag: '🇦🇬' },
  { code: 'AR', name: 'Argentina',              dial: '+54',   flag: '🇦🇷' },
  { code: 'AM', name: 'Armenia',                dial: '+374',  flag: '🇦🇲' },
  { code: 'AW', name: 'Aruba',                  dial: '+297',  flag: '🇦🇼' },
  { code: 'AU', name: 'Australia',              dial: '+61',   flag: '🇦🇺', example: '412 345 678',   nationalLength: 9,  stripTrunk: true },
  { code: 'AT', name: 'Austria',                dial: '+43',   flag: '🇦🇹', stripTrunk: true },
  { code: 'AZ', name: 'Azerbaijan',             dial: '+994',  flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas',                dial: '+1242', flag: '🇧🇸' },
  { code: 'BH', name: 'Bahrain',                dial: '+973',  flag: '🇧🇭' },
  { code: 'BD', name: 'Bangladesh',             dial: '+880',  flag: '🇧🇩' },
  { code: 'BB', name: 'Barbados',               dial: '+1246', flag: '🇧🇧' },
  { code: 'BY', name: 'Belarus',                dial: '+375',  flag: '🇧🇾' },
  { code: 'BE', name: 'Belgium',                dial: '+32',   flag: '🇧🇪', stripTrunk: true },
  { code: 'BZ', name: 'Belize',                 dial: '+501',  flag: '🇧🇿' },
  { code: 'BJ', name: 'Benin',                  dial: '+229',  flag: '🇧🇯' },
  { code: 'BM', name: 'Bermuda',                dial: '+1441', flag: '🇧🇲' },
  { code: 'BT', name: 'Bhutan',                 dial: '+975',  flag: '🇧🇹' },
  { code: 'BO', name: 'Bolivia',                dial: '+591',  flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia and Herzegovina', dial: '+387',  flag: '🇧🇦' },
  { code: 'BW', name: 'Botswana',               dial: '+267',  flag: '🇧🇼' },
  { code: 'BR', name: 'Brazil',                 dial: '+55',   flag: '🇧🇷' },
  { code: 'IO', name: 'British Indian Ocean Territory', dial: '+246', flag: '🇮🇴' },
  { code: 'VG', name: 'British Virgin Islands', dial: '+1284', flag: '🇻🇬' },
  { code: 'BN', name: 'Brunei',                 dial: '+673',  flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria',               dial: '+359',  flag: '🇧🇬', stripTrunk: true },
  { code: 'BF', name: 'Burkina Faso',           dial: '+226',  flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi',                dial: '+257',  flag: '🇧🇮' },
  { code: 'KH', name: 'Cambodia',               dial: '+855',  flag: '🇰🇭' },
  { code: 'CM', name: 'Cameroon',               dial: '+237',  flag: '🇨🇲' },
  { code: 'CA', name: 'Canada',                 dial: '+1',    flag: '🇨🇦', example: '555 123 4567',  nationalLength: 10 },
  { code: 'CV', name: 'Cape Verde',             dial: '+238',  flag: '🇨🇻' },
  { code: 'KY', name: 'Cayman Islands',         dial: '+1345', flag: '🇰🇾' },
  { code: 'CF', name: 'Central African Republic', dial: '+236', flag: '🇨🇫' },
  { code: 'TD', name: 'Chad',                   dial: '+235',  flag: '🇹🇩' },
  { code: 'CL', name: 'Chile',                  dial: '+56',   flag: '🇨🇱' },
  { code: 'CN', name: 'China',                  dial: '+86',   flag: '🇨🇳' },
  { code: 'CO', name: 'Colombia',               dial: '+57',   flag: '🇨🇴' },
  { code: 'KM', name: 'Comoros',                dial: '+269',  flag: '🇰🇲' },
  { code: 'CD', name: 'Congo (DRC)',            dial: '+243',  flag: '🇨🇩' },
  { code: 'CG', name: 'Congo (Republic)',       dial: '+242',  flag: '🇨🇬' },
  { code: 'CK', name: 'Cook Islands',           dial: '+682',  flag: '🇨🇰' },
  { code: 'CR', name: 'Costa Rica',             dial: '+506',  flag: '🇨🇷' },
  { code: 'CI', name: "Côte d'Ivoire",          dial: '+225',  flag: '🇨🇮' },
  { code: 'HR', name: 'Croatia',                dial: '+385',  flag: '🇭🇷', stripTrunk: true },
  { code: 'CU', name: 'Cuba',                   dial: '+53',   flag: '🇨🇺' },
  { code: 'CW', name: 'Curaçao',                dial: '+599',  flag: '🇨🇼' },
  { code: 'CY', name: 'Cyprus',                 dial: '+357',  flag: '🇨🇾' },
  { code: 'CZ', name: 'Czech Republic',         dial: '+420',  flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark',                dial: '+45',   flag: '🇩🇰' },
  { code: 'DJ', name: 'Djibouti',               dial: '+253',  flag: '🇩🇯' },
  { code: 'DM', name: 'Dominica',               dial: '+1767', flag: '🇩🇲' },
  { code: 'DO', name: 'Dominican Republic',     dial: '+1',    flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador',                dial: '+593',  flag: '🇪🇨', stripTrunk: true },
  { code: 'EG', name: 'Egypt',                  dial: '+20',   flag: '🇪🇬', stripTrunk: true },
  { code: 'SV', name: 'El Salvador',            dial: '+503',  flag: '🇸🇻' },
  { code: 'GQ', name: 'Equatorial Guinea',      dial: '+240',  flag: '🇬🇶' },
  { code: 'ER', name: 'Eritrea',                dial: '+291',  flag: '🇪🇷' },
  { code: 'EE', name: 'Estonia',                dial: '+372',  flag: '🇪🇪' },
  { code: 'SZ', name: 'Eswatini',               dial: '+268',  flag: '🇸🇿' },
  { code: 'ET', name: 'Ethiopia',               dial: '+251',  flag: '🇪🇹', stripTrunk: true },
  { code: 'FK', name: 'Falkland Islands',       dial: '+500',  flag: '🇫🇰' },
  { code: 'FO', name: 'Faroe Islands',          dial: '+298',  flag: '🇫🇴' },
  { code: 'FJ', name: 'Fiji',                   dial: '+679',  flag: '🇫🇯' },
  { code: 'FI', name: 'Finland',                dial: '+358',  flag: '🇫🇮', stripTrunk: true },
  { code: 'FR', name: 'France',                 dial: '+33',   flag: '🇫🇷', example: '6 12 34 56 78', nationalLength: 9,  stripTrunk: true },
  { code: 'GF', name: 'French Guiana',          dial: '+594',  flag: '🇬🇫' },
  { code: 'PF', name: 'French Polynesia',       dial: '+689',  flag: '🇵🇫' },
  { code: 'GA', name: 'Gabon',                  dial: '+241',  flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia',                 dial: '+220',  flag: '🇬🇲' },
  { code: 'GE', name: 'Georgia',                dial: '+995',  flag: '🇬🇪' },
  { code: 'DE', name: 'Germany',                dial: '+49',   flag: '🇩🇪', example: '1512 3456789',  stripTrunk: true },
  { code: 'GH', name: 'Ghana',                  dial: '+233',  flag: '🇬🇭', stripTrunk: true },
  { code: 'GI', name: 'Gibraltar',              dial: '+350',  flag: '🇬🇮' },
  { code: 'GR', name: 'Greece',                 dial: '+30',   flag: '🇬🇷' },
  { code: 'GL', name: 'Greenland',              dial: '+299',  flag: '🇬🇱' },
  { code: 'GD', name: 'Grenada',                dial: '+1473', flag: '🇬🇩' },
  { code: 'GP', name: 'Guadeloupe',             dial: '+590',  flag: '🇬🇵' },
  { code: 'GU', name: 'Guam',                   dial: '+1671', flag: '🇬🇺' },
  { code: 'GT', name: 'Guatemala',              dial: '+502',  flag: '🇬🇹' },
  { code: 'GG', name: 'Guernsey',               dial: '+44',   flag: '🇬🇬' },
  { code: 'GN', name: 'Guinea',                 dial: '+224',  flag: '🇬🇳' },
  { code: 'GW', name: 'Guinea-Bissau',          dial: '+245',  flag: '🇬🇼' },
  { code: 'GY', name: 'Guyana',                 dial: '+592',  flag: '🇬🇾' },
  { code: 'HT', name: 'Haiti',                  dial: '+509',  flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras',               dial: '+504',  flag: '🇭🇳' },
  { code: 'HK', name: 'Hong Kong',              dial: '+852',  flag: '🇭🇰' },
  { code: 'HU', name: 'Hungary',                dial: '+36',   flag: '🇭🇺' },
  { code: 'IS', name: 'Iceland',                dial: '+354',  flag: '🇮🇸' },
  { code: 'IN', name: 'India',                  dial: '+91',   flag: '🇮🇳', example: '98765 43210',   nationalLength: 10 },
  { code: 'ID', name: 'Indonesia',              dial: '+62',   flag: '🇮🇩', stripTrunk: true },
  { code: 'IR', name: 'Iran',                   dial: '+98',   flag: '🇮🇷', stripTrunk: true },
  { code: 'IQ', name: 'Iraq',                   dial: '+964',  flag: '🇮🇶', stripTrunk: true },
  { code: 'IE', name: 'Ireland',                dial: '+353',  flag: '🇮🇪', example: '85 123 4567',   nationalLength: 9,  stripTrunk: true },
  { code: 'IM', name: 'Isle of Man',            dial: '+44',   flag: '🇮🇲' },
  { code: 'IL', name: 'Israel',                 dial: '+972',  flag: '🇮🇱', stripTrunk: true },
  { code: 'IT', name: 'Italy',                  dial: '+39',   flag: '🇮🇹', example: '312 345 6789' },
  { code: 'JM', name: 'Jamaica',                dial: '+1876', flag: '🇯🇲' },
  { code: 'JP', name: 'Japan',                  dial: '+81',   flag: '🇯🇵', stripTrunk: true },
  { code: 'JE', name: 'Jersey',                 dial: '+44',   flag: '🇯🇪' },
  { code: 'JO', name: 'Jordan',                 dial: '+962',  flag: '🇯🇴', stripTrunk: true },
  { code: 'KZ', name: 'Kazakhstan',             dial: '+7',    flag: '🇰🇿' },
  { code: 'KE', name: 'Kenya',                  dial: '+254',  flag: '🇰🇪', stripTrunk: true },
  { code: 'KI', name: 'Kiribati',               dial: '+686',  flag: '🇰🇮' },
  { code: 'XK', name: 'Kosovo',                 dial: '+383',  flag: '🇽🇰' },
  { code: 'KW', name: 'Kuwait',                 dial: '+965',  flag: '🇰🇼' },
  { code: 'KG', name: 'Kyrgyzstan',             dial: '+996',  flag: '🇰🇬' },
  { code: 'LA', name: 'Laos',                   dial: '+856',  flag: '🇱🇦' },
  { code: 'LV', name: 'Latvia',                 dial: '+371',  flag: '🇱🇻' },
  { code: 'LB', name: 'Lebanon',                dial: '+961',  flag: '🇱🇧' },
  { code: 'LS', name: 'Lesotho',                dial: '+266',  flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia',                dial: '+231',  flag: '🇱🇷' },
  { code: 'LY', name: 'Libya',                  dial: '+218',  flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein',          dial: '+423',  flag: '🇱🇮' },
  { code: 'LT', name: 'Lithuania',              dial: '+370',  flag: '🇱🇹' },
  { code: 'LU', name: 'Luxembourg',             dial: '+352',  flag: '🇱🇺' },
  { code: 'MO', name: 'Macau',                  dial: '+853',  flag: '🇲🇴' },
  { code: 'MG', name: 'Madagascar',             dial: '+261',  flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi',                 dial: '+265',  flag: '🇲🇼' },
  { code: 'MY', name: 'Malaysia',               dial: '+60',   flag: '🇲🇾', stripTrunk: true },
  { code: 'MV', name: 'Maldives',               dial: '+960',  flag: '🇲🇻' },
  { code: 'ML', name: 'Mali',                   dial: '+223',  flag: '🇲🇱' },
  { code: 'MT', name: 'Malta',                  dial: '+356',  flag: '🇲🇹' },
  { code: 'MH', name: 'Marshall Islands',       dial: '+692',  flag: '🇲🇭' },
  { code: 'MQ', name: 'Martinique',             dial: '+596',  flag: '🇲🇶' },
  { code: 'MR', name: 'Mauritania',             dial: '+222',  flag: '🇲🇷' },
  { code: 'MU', name: 'Mauritius',              dial: '+230',  flag: '🇲🇺' },
  { code: 'MX', name: 'Mexico',                 dial: '+52',   flag: '🇲🇽' },
  { code: 'FM', name: 'Micronesia',             dial: '+691',  flag: '🇫🇲' },
  { code: 'MD', name: 'Moldova',                dial: '+373',  flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco',                 dial: '+377',  flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia',               dial: '+976',  flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro',             dial: '+382',  flag: '🇲🇪' },
  { code: 'MS', name: 'Montserrat',             dial: '+1664', flag: '🇲🇸' },
  { code: 'MA', name: 'Morocco',                dial: '+212',  flag: '🇲🇦', stripTrunk: true },
  { code: 'MZ', name: 'Mozambique',             dial: '+258',  flag: '🇲🇿' },
  { code: 'MM', name: 'Myanmar',                dial: '+95',   flag: '🇲🇲', stripTrunk: true },
  { code: 'NA', name: 'Namibia',                dial: '+264',  flag: '🇳🇦', stripTrunk: true },
  { code: 'NR', name: 'Nauru',                  dial: '+674',  flag: '🇳🇷' },
  { code: 'NP', name: 'Nepal',                  dial: '+977',  flag: '🇳🇵' },
  { code: 'NL', name: 'Netherlands',            dial: '+31',   flag: '🇳🇱', example: '6 12345678',    nationalLength: 9,  stripTrunk: true },
  { code: 'NC', name: 'New Caledonia',          dial: '+687',  flag: '🇳🇨' },
  { code: 'NZ', name: 'New Zealand',            dial: '+64',   flag: '🇳🇿', stripTrunk: true },
  { code: 'NI', name: 'Nicaragua',              dial: '+505',  flag: '🇳🇮' },
  { code: 'NE', name: 'Niger',                  dial: '+227',  flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria',                dial: '+234',  flag: '🇳🇬', example: '802 123 4567',  nationalLength: 10, stripTrunk: true },
  { code: 'NU', name: 'Niue',                   dial: '+683',  flag: '🇳🇺' },
  { code: 'KP', name: 'North Korea',            dial: '+850',  flag: '🇰🇵' },
  { code: 'MK', name: 'North Macedonia',        dial: '+389',  flag: '🇲🇰' },
  { code: 'MP', name: 'Northern Mariana Islands', dial: '+1670', flag: '🇲🇵' },
  { code: 'NO', name: 'Norway',                 dial: '+47',   flag: '🇳🇴' },
  { code: 'OM', name: 'Oman',                   dial: '+968',  flag: '🇴🇲' },
  { code: 'PK', name: 'Pakistan',               dial: '+92',   flag: '🇵🇰', stripTrunk: true },
  { code: 'PW', name: 'Palau',                  dial: '+680',  flag: '🇵🇼' },
  { code: 'PS', name: 'Palestine',              dial: '+970',  flag: '🇵🇸' },
  { code: 'PA', name: 'Panama',                 dial: '+507',  flag: '🇵🇦' },
  { code: 'PG', name: 'Papua New Guinea',       dial: '+675',  flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay',               dial: '+595',  flag: '🇵🇾' },
  { code: 'PE', name: 'Peru',                   dial: '+51',   flag: '🇵🇪' },
  { code: 'PH', name: 'Philippines',            dial: '+63',   flag: '🇵🇭', stripTrunk: true },
  { code: 'PL', name: 'Poland',                 dial: '+48',   flag: '🇵🇱', example: '512 345 678',   nationalLength: 9 },
  { code: 'PT', name: 'Portugal',               dial: '+351',  flag: '🇵🇹', example: '912 345 678',   nationalLength: 9 },
  { code: 'PR', name: 'Puerto Rico',            dial: '+1',    flag: '🇵🇷' },
  { code: 'QA', name: 'Qatar',                  dial: '+974',  flag: '🇶🇦' },
  { code: 'RE', name: 'Réunion',                dial: '+262',  flag: '🇷🇪' },
  { code: 'RO', name: 'Romania',                dial: '+40',   flag: '🇷🇴', example: '712 345 678',   nationalLength: 9,  stripTrunk: true },
  { code: 'RU', name: 'Russia',                 dial: '+7',    flag: '🇷🇺' },
  { code: 'RW', name: 'Rwanda',                 dial: '+250',  flag: '🇷🇼' },
  { code: 'BL', name: 'Saint Barthélemy',       dial: '+590',  flag: '🇧🇱' },
  { code: 'SH', name: 'Saint Helena',           dial: '+290',  flag: '🇸🇭' },
  { code: 'KN', name: 'Saint Kitts and Nevis',  dial: '+1869', flag: '🇰🇳' },
  { code: 'LC', name: 'Saint Lucia',            dial: '+1758', flag: '🇱🇨' },
  { code: 'MF', name: 'Saint Martin',           dial: '+590',  flag: '🇲🇫' },
  { code: 'PM', name: 'Saint Pierre and Miquelon', dial: '+508', flag: '🇵🇲' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', dial: '+1784', flag: '🇻🇨' },
  { code: 'WS', name: 'Samoa',                  dial: '+685',  flag: '🇼🇸' },
  { code: 'SM', name: 'San Marino',             dial: '+378',  flag: '🇸🇲' },
  { code: 'ST', name: 'São Tomé and Príncipe',  dial: '+239',  flag: '🇸🇹' },
  { code: 'SA', name: 'Saudi Arabia',           dial: '+966',  flag: '🇸🇦', stripTrunk: true },
  { code: 'SN', name: 'Senegal',                dial: '+221',  flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia',                 dial: '+381',  flag: '🇷🇸', stripTrunk: true },
  { code: 'SC', name: 'Seychelles',             dial: '+248',  flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone',           dial: '+232',  flag: '🇸🇱' },
  { code: 'SG', name: 'Singapore',              dial: '+65',   flag: '🇸🇬' },
  { code: 'SX', name: 'Sint Maarten',           dial: '+1721', flag: '🇸🇽' },
  { code: 'SK', name: 'Slovakia',               dial: '+421',  flag: '🇸🇰', stripTrunk: true },
  { code: 'SI', name: 'Slovenia',               dial: '+386',  flag: '🇸🇮', stripTrunk: true },
  { code: 'SB', name: 'Solomon Islands',        dial: '+677',  flag: '🇸🇧' },
  { code: 'SO', name: 'Somalia',                dial: '+252',  flag: '🇸🇴' },
  { code: 'ZA', name: 'South Africa',           dial: '+27',   flag: '🇿🇦', example: '71 123 4567',   nationalLength: 9,  stripTrunk: true },
  { code: 'KR', name: 'South Korea',            dial: '+82',   flag: '🇰🇷', stripTrunk: true },
  { code: 'SS', name: 'South Sudan',            dial: '+211',  flag: '🇸🇸' },
  { code: 'ES', name: 'Spain',                  dial: '+34',   flag: '🇪🇸', example: '612 34 56 78',  nationalLength: 9 },
  { code: 'LK', name: 'Sri Lanka',              dial: '+94',   flag: '🇱🇰', stripTrunk: true },
  { code: 'SD', name: 'Sudan',                  dial: '+249',  flag: '🇸🇩' },
  { code: 'SR', name: 'Suriname',               dial: '+597',  flag: '🇸🇷' },
  { code: 'SE', name: 'Sweden',                 dial: '+46',   flag: '🇸🇪', stripTrunk: true },
  { code: 'CH', name: 'Switzerland',            dial: '+41',   flag: '🇨🇭', stripTrunk: true },
  { code: 'SY', name: 'Syria',                  dial: '+963',  flag: '🇸🇾' },
  { code: 'TW', name: 'Taiwan',                 dial: '+886',  flag: '🇹🇼', stripTrunk: true },
  { code: 'TJ', name: 'Tajikistan',             dial: '+992',  flag: '🇹🇯' },
  { code: 'TZ', name: 'Tanzania',               dial: '+255',  flag: '🇹🇿', stripTrunk: true },
  { code: 'TH', name: 'Thailand',               dial: '+66',   flag: '🇹🇭', stripTrunk: true },
  { code: 'TL', name: 'Timor-Leste',            dial: '+670',  flag: '🇹🇱' },
  { code: 'TG', name: 'Togo',                   dial: '+228',  flag: '🇹🇬' },
  { code: 'TK', name: 'Tokelau',                dial: '+690',  flag: '🇹🇰' },
  { code: 'TO', name: 'Tonga',                  dial: '+676',  flag: '🇹🇴' },
  { code: 'TT', name: 'Trinidad and Tobago',    dial: '+1868', flag: '🇹🇹' },
  { code: 'TN', name: 'Tunisia',                dial: '+216',  flag: '🇹🇳' },
  { code: 'TR', name: 'Turkey',                 dial: '+90',   flag: '🇹🇷', stripTrunk: true },
  { code: 'TM', name: 'Turkmenistan',           dial: '+993',  flag: '🇹🇲' },
  { code: 'TC', name: 'Turks and Caicos Islands', dial: '+1649', flag: '🇹🇨' },
  { code: 'TV', name: 'Tuvalu',                 dial: '+688',  flag: '🇹🇻' },
  { code: 'UG', name: 'Uganda',                 dial: '+256',  flag: '🇺🇬', stripTrunk: true },
  { code: 'UA', name: 'Ukraine',                dial: '+380',  flag: '🇺🇦', stripTrunk: true },
  { code: 'AE', name: 'United Arab Emirates',   dial: '+971',  flag: '🇦🇪', stripTrunk: true },
  { code: 'GB', name: 'United Kingdom',         dial: '+44',   flag: '🇬🇧', example: '7700 900000',   nationalLength: 10, stripTrunk: true },
  { code: 'US', name: 'United States',          dial: '+1',    flag: '🇺🇸', example: '555 123 4567',  nationalLength: 10 },
  { code: 'UY', name: 'Uruguay',                dial: '+598',  flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistan',             dial: '+998',  flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu',                dial: '+678',  flag: '🇻🇺' },
  { code: 'VA', name: 'Vatican City',           dial: '+39',   flag: '🇻🇦' },
  { code: 'VE', name: 'Venezuela',              dial: '+58',   flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam',                dial: '+84',   flag: '🇻🇳', stripTrunk: true },
  { code: 'WF', name: 'Wallis and Futuna',      dial: '+681',  flag: '🇼🇫' },
  { code: 'YE', name: 'Yemen',                  dial: '+967',  flag: '🇾🇪' },
  { code: 'ZM', name: 'Zambia',                 dial: '+260',  flag: '🇿🇲', stripTrunk: true },
  { code: 'ZW', name: 'Zimbabwe',               dial: '+263',  flag: '🇿🇼', stripTrunk: true },
]

export const DEFAULT_COUNTRY: Country = COUNTRIES.find((c) => c.code === 'GB')!

// Sort the picker so the UK sits at the top, followed by all other countries alphabetically.
export const COUNTRIES_FOR_PICKER: Country[] = [
  DEFAULT_COUNTRY,
  ...COUNTRIES.filter((c) => c.code !== 'GB'),
]

// Several territories share a dial code (e.g. GB/GG/IM/JE all use +44; US/CA/PR/DR
// all use +1). For resolving an existing phone back to a picker country, we want the
// primary / expected territory — GB for +44, US for +1 — not the first alphabetical match.
const PRIMARY_FOR_DIAL: Record<string, string> = {
  '+44': 'GB',
  '+1': 'US',
}

export function splitPhone(full: string | null | undefined): { country: Country; national: string } {
  if (!full) return { country: DEFAULT_COUNTRY, national: '' }
  // Sort longest dial-code first so NANP sub-codes (+1876, +1284, …) resolve precisely
  // before the generic +1. For equal-length dial codes, prefer the primary territory.
  const sorted = [...COUNTRIES].sort((a, b) => {
    if (b.dial.length !== a.dial.length) return b.dial.length - a.dial.length
    const aPrimary = PRIMARY_FOR_DIAL[a.dial] === a.code ? 0 : 1
    const bPrimary = PRIMARY_FOR_DIAL[b.dial] === b.code ? 0 : 1
    return aPrimary - bPrimary
  })
  const hit = sorted.find((c) => full.startsWith(c.dial))
  if (!hit) return { country: DEFAULT_COUNTRY, national: full.replace(/^\+/, '') }
  return { country: hit, national: full.slice(hit.dial.length).replace(/\D/g, '') }
}

// ── Web phone helpers (ported from the app's RegisterScreen; keep in sync) ────

const E164_RE = /^\+[1-9]\d{7,14}$/

export function normaliseNational(country: Country, raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (country.stripTrunk && digits.startsWith('0')) return digits.slice(1)
  return digits
}

export type PhoneValidation = { ok: true; e164: string } | { ok: false; message: string }

export function validateNational(country: Country, raw: string): PhoneValidation {
  const digits = normaliseNational(country, raw)
  if (digits.length === 0) return { ok: false, message: 'Enter your mobile number.' }
  if (country.nationalLength !== undefined) {
    if (digits.length < country.nationalLength)
      return { ok: false, message: `Too short: ${country.name} numbers have ${country.nationalLength} digits.` }
    if (digits.length > country.nationalLength)
      return { ok: false, message: `Too long: ${country.name} numbers have ${country.nationalLength} digits.` }
  }
  const e164 = `${country.dial}${digits}`
  if (!E164_RE.test(e164)) return { ok: false, message: 'Enter a valid mobile number.' }
  return { ok: true, e164 }
}
