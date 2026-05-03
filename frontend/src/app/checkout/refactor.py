import re

with open(r'c:\Users\semen\Desktop\Programing\ArtShop\frontend\src\app\checkout\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace everything before 'export default function CheckoutPage()'
imports = """\"use client\";

import { useState, useEffect, useMemo, useRef, useCallback } from \"react\";
import Link from \"next/link\";
import { useCart } from \"@/context/CartContext\";
import { usePreferences } from \"@/context/PreferencesContext\";
import { GoogleLogin } from \"@react-oauth/google\";
import { useUser } from \"@/context/UserContext\";
import { getApiUrl, apiFetch } from \"@/utils\";
import {
    countries,
    getStateLabel,
    getPostalLabel,
    detectUserCountry,
    countryCodeToFlag,
} from \"@/countries\";

import { inputBase, sectionTitle } from \"./styles\";
import { SmartInput } from \"./components/SmartInput\";
import { PhoneInput } from \"./components/PhoneInput\";
import { CountrySelect } from \"./components/CountrySelect\";
import { AddressInput } from \"./components/AddressInput\";
import { StepIndicator } from \"./components/StepIndicator\";
import { OrderSummary } from \"./components/OrderSummary\";

"""

content = re.sub(r'^.*?export default function CheckoutPage\(\)', imports + 'export default function CheckoutPage()', content, flags=re.DOTALL)

# 2. Replace OrderSummary block
order_summary_block = r'<div className=\"checkout-summary\".*?</div>\s*</div>'
content = re.sub(order_summary_block, '<OrderSummary items={items} promoApplied={promoApplied} discountAmount={discountAmount} cartTotal={cartTotal} currentTotal={currentTotal} convertPrice={convertPrice} />', content, flags=re.DOTALL)

# 3. Remove StepIndicator
content = re.sub(r'/\* -+ \*/\s*/\*  Step indicator dot.*', '', content, flags=re.DOTALL)

with open(r'c:\Users\semen\Desktop\Programing\ArtShop\frontend\src\app\checkout\page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
