import sys

file_path = 'src/app/artwork/[slug]/page.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start index: `                    {/* ── Right: Purchase panel ── */}`
# Find the end index: the closing div of `<div style={{ marginTop: layoutMetrics.winW < 768 ? "1.5rem" : "6rem", ... }}>` which is around line 1455.

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "{/* ── Right: Purchase panel ── */}" in line:
        start_idx = i
        break

for i in range(start_idx, len(lines)):
    if "{/* ── Artwork details section ── */}" in line:
        end_idx = i - 1
        break

# We know from `purchase_block.txt` that the block ends before `{/* ── Artwork details section ── */}`
for i in range(start_idx, len(lines)):
    if "{/* ── Artwork details section ── */}" in lines[i]:
        end_idx = i - 1
        break

# Prepare the replacement
replacement = [
    '                    {/* ── Right: Purchase panel ── */}\n',
    '                    <ArtworkPurchaseStyles />\n',
    '                    <ArtworkPurchasePanel\n',
    '                        work={work}\n',
    '                        layoutMetrics={layoutMetrics}\n',
    '                        effectiveLiked={effectiveLiked}\n',
    '                        setLiked={setLiked}\n',
    '                        user={user}\n',
    '                        addPendingLike={addPendingLike}\n',
    '                        removePendingLike={removePendingLike}\n',
    '                        incrementUnauthLikeCount={incrementUnauthLikeCount}\n',
    '                        unauthLikeCount={unauthLikeCount}\n',
    '                        setShowAuthPrompt={setShowAuthPrompt}\n',
    '                        resolvedPurchaseType={resolvedPurchaseType}\n',
    '                        hasCanvasOffers={hasCanvasOffers}\n',
    '                        hasPaperOffers={hasPaperOffers}\n',
    '                        updateRouteState={updateRouteState}\n',
    '                        activeCountryCode={activeCountryCode}\n',
    '                        convertPrice={convertPrice}\n',
    '                        addItem={addItem}\n',
    '                        units={units}\n',
    '                        storefront={storefront}\n',
    '                        storefrontLoading={storefrontLoading}\n',
    '                        storefrontError={storefrontError}\n',
    '                    />\n',
    '                </div>\n'
]

# Now we also need to add imports at the top
import_lines = [
    'import { ArtworkPurchasePanel } from "./components/ArtworkPurchasePanel";\n',
    'import { ArtworkPurchaseStyles } from "./components/ArtworkPurchaseStyles";\n'
]

# insert imports at line 19
lines = lines[:19] + import_lines + lines[19:]

# Because we added 2 lines, we adjust start_idx and end_idx
start_idx += 2
end_idx += 2

# We also need to fix `ArtworkPurchaseStyles` without props in `ArtworkPurchaseStyles.tsx`
with open('src/app/artwork/[slug]/components/ArtworkPurchaseStyles.tsx', 'r', encoding='utf-8') as f:
    style_content = f.read()

style_content = style_content.replace('export function ArtworkPurchaseStyles({ isSmall, resolvedPurchaseType }: { isSmall: boolean; resolvedPurchaseType: string }) {', 'export function ArtworkPurchaseStyles() {')
with open('src/app/artwork/[slug]/components/ArtworkPurchaseStyles.tsx', 'w', encoding='utf-8') as f:
    f.write(style_content)

new_lines = lines[:start_idx] + replacement + lines[end_idx+1:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'Updated artwork page. Extracted {end_idx - start_idx} lines.')
