/**
 * Comprehensive list of countries for the shipping address form.
 * Each entry includes the display name, ISO 3166-1 alpha-2 code, and phone prefix.
 * Sorted alphabetically by name for dropdown display.
 */

export interface Country {
    name: string;
    code: string;
    phone: string;
}

export const countries: Country[] = [
    { name: "Afghanistan", code: "AF", phone: "+93" },
    { name: "Albania", code: "AL", phone: "+355" },
    { name: "Algeria", code: "DZ", phone: "+213" },
    { name: "Andorra", code: "AD", phone: "+376" },
    { name: "Angola", code: "AO", phone: "+244" },
    { name: "Antigua and Barbuda", code: "AG", phone: "+1-268" },
    { name: "Argentina", code: "AR", phone: "+54" },
    { name: "Armenia", code: "AM", phone: "+374" },
    { name: "Australia", code: "AU", phone: "+61" },
    { name: "Austria", code: "AT", phone: "+43" },
    { name: "Azerbaijan", code: "AZ", phone: "+994" },
    { name: "Bahamas", code: "BS", phone: "+1-242" },
    { name: "Bahrain", code: "BH", phone: "+973" },
    { name: "Bangladesh", code: "BD", phone: "+880" },
    { name: "Barbados", code: "BB", phone: "+1-246" },
    { name: "Belarus", code: "BY", phone: "+375" },
    { name: "Belgium", code: "BE", phone: "+32" },
    { name: "Belize", code: "BZ", phone: "+501" },
    { name: "Benin", code: "BJ", phone: "+229" },
    { name: "Bhutan", code: "BT", phone: "+975" },
    { name: "Bolivia", code: "BO", phone: "+591" },
    { name: "Bosnia and Herzegovina", code: "BA", phone: "+387" },
    { name: "Botswana", code: "BW", phone: "+267" },
    { name: "Brazil", code: "BR", phone: "+55" },
    { name: "Brunei", code: "BN", phone: "+673" },
    { name: "Bulgaria", code: "BG", phone: "+359" },
    { name: "Burkina Faso", code: "BF", phone: "+226" },
    { name: "Burundi", code: "BI", phone: "+257" },
    { name: "Cambodia", code: "KH", phone: "+855" },
    { name: "Cameroon", code: "CM", phone: "+237" },
    { name: "Canada", code: "CA", phone: "+1" },
    { name: "Cape Verde", code: "CV", phone: "+238" },
    { name: "Central African Republic", code: "CF", phone: "+236" },
    { name: "Chad", code: "TD", phone: "+235" },
    { name: "Chile", code: "CL", phone: "+56" },
    { name: "China", code: "CN", phone: "+86" },
    { name: "Colombia", code: "CO", phone: "+57" },
    { name: "Comoros", code: "KM", phone: "+269" },
    { name: "Congo (DRC)", code: "CD", phone: "+243" },
    { name: "Congo (Republic)", code: "CG", phone: "+242" },
    { name: "Costa Rica", code: "CR", phone: "+506" },
    { name: "Croatia", code: "HR", phone: "+385" },
    { name: "Cuba", code: "CU", phone: "+53" },
    { name: "Cyprus", code: "CY", phone: "+357" },
    { name: "Czech Republic", code: "CZ", phone: "+420" },
    { name: "Denmark", code: "DK", phone: "+45" },
    { name: "Djibouti", code: "DJ", phone: "+253" },
    { name: "Dominica", code: "DM", phone: "+1-767" },
    { name: "Dominican Republic", code: "DO", phone: "+1-809" },
    { name: "Ecuador", code: "EC", phone: "+593" },
    { name: "Egypt", code: "EG", phone: "+20" },
    { name: "El Salvador", code: "SV", phone: "+503" },
    { name: "Equatorial Guinea", code: "GQ", phone: "+240" },
    { name: "Eritrea", code: "ER", phone: "+291" },
    { name: "Estonia", code: "EE", phone: "+372" },
    { name: "Eswatini", code: "SZ", phone: "+268" },
    { name: "Ethiopia", code: "ET", phone: "+251" },
    { name: "Fiji", code: "FJ", phone: "+679" },
    { name: "Finland", code: "FI", phone: "+358" },
    { name: "France", code: "FR", phone: "+33" },
    { name: "Gabon", code: "GA", phone: "+241" },
    { name: "Gambia", code: "GM", phone: "+220" },
    { name: "Georgia", code: "GE", phone: "+995" },
    { name: "Germany", code: "DE", phone: "+49" },
    { name: "Ghana", code: "GH", phone: "+233" },
    { name: "Greece", code: "GR", phone: "+30" },
    { name: "Grenada", code: "GD", phone: "+1-473" },
    { name: "Guatemala", code: "GT", phone: "+502" },
    { name: "Guinea", code: "GN", phone: "+224" },
    { name: "Guinea-Bissau", code: "GW", phone: "+245" },
    { name: "Guyana", code: "GY", phone: "+592" },
    { name: "Haiti", code: "HT", phone: "+509" },
    { name: "Honduras", code: "HN", phone: "+504" },
    { name: "Hong Kong", code: "HK", phone: "+852" },
    { name: "Hungary", code: "HU", phone: "+36" },
    { name: "Iceland", code: "IS", phone: "+354" },
    { name: "India", code: "IN", phone: "+91" },
    { name: "Indonesia", code: "ID", phone: "+62" },
    { name: "Iran", code: "IR", phone: "+98" },
    { name: "Iraq", code: "IQ", phone: "+964" },
    { name: "Ireland", code: "IE", phone: "+353" },
    { name: "Israel", code: "IL", phone: "+972" },
    { name: "Italy", code: "IT", phone: "+39" },
    { name: "Ivory Coast", code: "CI", phone: "+225" },
    { name: "Jamaica", code: "JM", phone: "+1-876" },
    { name: "Japan", code: "JP", phone: "+81" },
    { name: "Jordan", code: "JO", phone: "+962" },
    { name: "Kazakhstan", code: "KZ", phone: "+7" },
    { name: "Kenya", code: "KE", phone: "+254" },
    { name: "Kiribati", code: "KI", phone: "+686" },
    { name: "Kosovo", code: "XK", phone: "+383" },
    { name: "Kuwait", code: "KW", phone: "+965" },
    { name: "Kyrgyzstan", code: "KG", phone: "+996" },
    { name: "Laos", code: "LA", phone: "+856" },
    { name: "Latvia", code: "LV", phone: "+371" },
    { name: "Lebanon", code: "LB", phone: "+961" },
    { name: "Lesotho", code: "LS", phone: "+266" },
    { name: "Liberia", code: "LR", phone: "+231" },
    { name: "Libya", code: "LY", phone: "+218" },
    { name: "Liechtenstein", code: "LI", phone: "+423" },
    { name: "Lithuania", code: "LT", phone: "+370" },
    { name: "Luxembourg", code: "LU", phone: "+352" },
    { name: "Macau", code: "MO", phone: "+853" },
    { name: "Madagascar", code: "MG", phone: "+261" },
    { name: "Malawi", code: "MW", phone: "+265" },
    { name: "Malaysia", code: "MY", phone: "+60" },
    { name: "Maldives", code: "MV", phone: "+960" },
    { name: "Mali", code: "ML", phone: "+223" },
    { name: "Malta", code: "MT", phone: "+356" },
    { name: "Marshall Islands", code: "MH", phone: "+692" },
    { name: "Mauritania", code: "MR", phone: "+222" },
    { name: "Mauritius", code: "MU", phone: "+230" },
    { name: "Mexico", code: "MX", phone: "+52" },
    { name: "Micronesia", code: "FM", phone: "+691" },
    { name: "Moldova", code: "MD", phone: "+373" },
    { name: "Monaco", code: "MC", phone: "+377" },
    { name: "Mongolia", code: "MN", phone: "+976" },
    { name: "Montenegro", code: "ME", phone: "+382" },
    { name: "Morocco", code: "MA", phone: "+212" },
    { name: "Mozambique", code: "MZ", phone: "+258" },
    { name: "Myanmar", code: "MM", phone: "+95" },
    { name: "Namibia", code: "NA", phone: "+264" },
    { name: "Nauru", code: "NR", phone: "+674" },
    { name: "Nepal", code: "NP", phone: "+977" },
    { name: "Netherlands", code: "NL", phone: "+31" },
    { name: "New Zealand", code: "NZ", phone: "+64" },
    { name: "Nicaragua", code: "NI", phone: "+505" },
    { name: "Niger", code: "NE", phone: "+227" },
    { name: "Nigeria", code: "NG", phone: "+234" },
    { name: "North Korea", code: "KP", phone: "+850" },
    { name: "North Macedonia", code: "MK", phone: "+389" },
    { name: "Norway", code: "NO", phone: "+47" },
    { name: "Oman", code: "OM", phone: "+968" },
    { name: "Pakistan", code: "PK", phone: "+92" },
    { name: "Palau", code: "PW", phone: "+680" },
    { name: "Palestine", code: "PS", phone: "+970" },
    { name: "Panama", code: "PA", phone: "+507" },
    { name: "Papua New Guinea", code: "PG", phone: "+675" },
    { name: "Paraguay", code: "PY", phone: "+595" },
    { name: "Peru", code: "PE", phone: "+51" },
    { name: "Philippines", code: "PH", phone: "+63" },
    { name: "Poland", code: "PL", phone: "+48" },
    { name: "Portugal", code: "PT", phone: "+351" },
    { name: "Qatar", code: "QA", phone: "+974" },
    { name: "Romania", code: "RO", phone: "+40" },
    { name: "Russia", code: "RU", phone: "+7" },
    { name: "Rwanda", code: "RW", phone: "+250" },
    { name: "Saint Kitts and Nevis", code: "KN", phone: "+1-869" },
    { name: "Saint Lucia", code: "LC", phone: "+1-758" },
    { name: "Saint Vincent", code: "VC", phone: "+1-784" },
    { name: "Samoa", code: "WS", phone: "+685" },
    { name: "San Marino", code: "SM", phone: "+378" },
    { name: "São Tomé and Príncipe", code: "ST", phone: "+239" },
    { name: "Saudi Arabia", code: "SA", phone: "+966" },
    { name: "Senegal", code: "SN", phone: "+221" },
    { name: "Serbia", code: "RS", phone: "+381" },
    { name: "Seychelles", code: "SC", phone: "+248" },
    { name: "Sierra Leone", code: "SL", phone: "+232" },
    { name: "Singapore", code: "SG", phone: "+65" },
    { name: "Slovakia", code: "SK", phone: "+421" },
    { name: "Slovenia", code: "SI", phone: "+386" },
    { name: "Solomon Islands", code: "SB", phone: "+677" },
    { name: "Somalia", code: "SO", phone: "+252" },
    { name: "South Africa", code: "ZA", phone: "+27" },
    { name: "South Korea", code: "KR", phone: "+82" },
    { name: "South Sudan", code: "SS", phone: "+211" },
    { name: "Spain", code: "ES", phone: "+34" },
    { name: "Sri Lanka", code: "LK", phone: "+94" },
    { name: "Sudan", code: "SD", phone: "+249" },
    { name: "Suriname", code: "SR", phone: "+597" },
    { name: "Sweden", code: "SE", phone: "+46" },
    { name: "Switzerland", code: "CH", phone: "+41" },
    { name: "Syria", code: "SY", phone: "+963" },
    { name: "Taiwan", code: "TW", phone: "+886" },
    { name: "Tajikistan", code: "TJ", phone: "+992" },
    { name: "Tanzania", code: "TZ", phone: "+255" },
    { name: "Thailand", code: "TH", phone: "+66" },
    { name: "Timor-Leste", code: "TL", phone: "+670" },
    { name: "Togo", code: "TG", phone: "+228" },
    { name: "Tonga", code: "TO", phone: "+676" },
    { name: "Trinidad and Tobago", code: "TT", phone: "+1-868" },
    { name: "Tunisia", code: "TN", phone: "+216" },
    { name: "Turkey", code: "TR", phone: "+90" },
    { name: "Turkmenistan", code: "TM", phone: "+993" },
    { name: "Tuvalu", code: "TV", phone: "+688" },
    { name: "Uganda", code: "UG", phone: "+256" },
    { name: "Ukraine", code: "UA", phone: "+380" },
    { name: "United Arab Emirates", code: "AE", phone: "+971" },
    { name: "United Kingdom", code: "GB", phone: "+44" },
    { name: "United States", code: "US", phone: "+1" },
    { name: "Uruguay", code: "UY", phone: "+598" },
    { name: "Uzbekistan", code: "UZ", phone: "+998" },
    { name: "Vanuatu", code: "VU", phone: "+678" },
    { name: "Vatican City", code: "VA", phone: "+39" },
    { name: "Venezuela", code: "VE", phone: "+58" },
    { name: "Vietnam", code: "VN", phone: "+84" },
    { name: "Yemen", code: "YE", phone: "+967" },
    { name: "Zambia", code: "ZM", phone: "+260" },
    { name: "Zimbabwe", code: "ZW", phone: "+263" },
];

/**
 * Returns country-appropriate labels for the state/province field.
 */
export function getStateLabel(countryCode: string): string {
    switch (countryCode) {
        case "US": return "State";
        case "CA": return "Province";
        case "AU": return "State / Territory";
        case "GB": return "County";
        case "JP": return "Prefecture";
        case "CN": return "Province";
        case "BR": return "State";
        case "IN": return "State";
        case "DE": return "Bundesland";
        case "IT": return "Provincia";
        case "ES": return "Provincia";
        case "FR": return "Région";
        default: return "State / Province / Region";
    }
}

/**
 * Returns country-appropriate labels for the postal code field.
 */
export function getPostalLabel(countryCode: string): string {
    switch (countryCode) {
        case "US": return "ZIP Code";
        case "GB": return "Postcode";
        case "CA": return "Postal Code";
        case "AU": return "Postcode";
        case "IE": return "Eircode";
        case "IN": return "PIN Code";
        case "JP": return "Postal Code (〒)";
        case "BR": return "CEP";
        default: return "Postal / ZIP Code";
    }
}

/**
 * Tries to detect the user's country from their browser locale.
 * Falls back to Ukraine if detection fails.
 */
export function detectUserCountry(): string {
    if (typeof navigator === "undefined") return "UA";
    const locale = navigator.language || "";
    const parts = locale.split("-");
    if (parts.length >= 2) {
        const code = parts[parts.length - 1].toUpperCase();
        if (code.length === 2 && countries.find(c => c.code === code)) {
            return code;
        }
    }
    return "UA";
}

/**
 * Converts an ISO 3166-1 alpha-2 country code to its emoji flag.
 * Uses Unicode Regional Indicator Symbol pairs (e.g. "US" → 🇺🇸).
 * Works natively in all modern browsers and OS emoji renderers.
 */
export function countryCodeToFlag(code: string): string {
    if (!code || code.length !== 2) return "";
    return code
        .toUpperCase()
        .split("")
        .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
        .join("");
}
