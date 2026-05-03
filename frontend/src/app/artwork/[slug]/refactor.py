import re

with open(r'c:\Users\semen\Desktop\Programing\ArtShop\frontend\src\app\artwork\[slug]\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace types and constants
imports = """import { type Artwork, type OriginalStatus, type ArtworkImage } from "./types";
import { DEFAULT_GRADIENTS, STATUS_BADGE } from "./constants";
import { AuthPromptModal } from "./components/AuthPromptModal";
"""

type_block = r'type OriginalStatus.*?(?=export default function ArtworkDetailPage\(\))'
content = re.sub(type_block, imports + '\n', content, flags=re.DOTALL)

# 2. Replace Auth Prompt Modal
auth_prompt_block = r'\{\s*showAuthPrompt && \(\s*<div\s*onClick=\{\(\) => setShowAuthPrompt\(false\)\}.*?</div>\s*\)\s*\}'
content = re.sub(auth_prompt_block, '<AuthPromptModal isOpen={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />', content, flags=re.DOTALL)

with open(r'c:\Users\semen\Desktop\Programing\ArtShop\frontend\src\app\artwork\[slug]\page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
