import re

with open(r'c:\Users\semen\Desktop\Programing\ArtShop\frontend\src\components\Navbar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports for SegmentedPill and PreferencesDropdown
imports_add = """import { SegmentedPill } from "./SegmentedPill";
import { PreferencesDropdown } from "./PreferencesDropdown";
"""

# Find the last import and add our new imports
content = re.sub(r'(import { useCart } from "@/context/CartContext";)', r'\1\n' + imports_add, content)

# 2. Remove LOCAL_CURRENCY_LABELS, SegmentedPill function, PreferencesDropdown function
# The block starts with `const LOCAL_CURRENCY_LABELS` and ends before `export default function Navbar()`
block_to_remove = r'const LOCAL_CURRENCY_LABELS.*?(?=export default function Navbar\(\))'
content = re.sub(block_to_remove, '', content, flags=re.DOTALL)

with open(r'c:\Users\semen\Desktop\Programing\ArtShop\frontend\src\components\Navbar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
