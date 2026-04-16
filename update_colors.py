import os
import glob

components_dir = 'c:/Users/semen/Desktop/Programing/ArtShop/frontend/src/app/admin/components'

replacements = {
    'bg-zinc-900 ': 'bg-[#31323E] ',
    'bg-zinc-900"': 'bg-[#31323E]"',
    'bg-zinc-900/': 'bg-[#31323E]/',
    'hover:bg-zinc-800': 'hover:bg-[#434455]',
    'border-zinc-900': 'border-[#31323E]',
    'text-zinc-900 ': 'text-[#31323E] ',
    'text-zinc-900"': 'text-[#31323E]"',
    
    'bg-black ': 'bg-[#31323E] ',
    'bg-black"': 'bg-[#31323E]"',
    'hover:bg-black': 'hover:bg-[#434455]',
    'hover:bg-gray-800': 'hover:bg-[#434455]',
    'border-black ': 'border-[#31323E] ',
    'border-black"': 'border-[#31323E]"',
    
    'text-black ': 'text-[#31323E] ',
    'text-black"': 'text-[#31323E]"',
    'hover:text-black ': 'hover:text-[#31323E] ',
    'hover:text-black"': 'hover:text-[#31323E]"'
}

for filepath in glob.glob(os.path.join(components_dir, '*.tsx')):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)
        
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Updated {os.path.basename(filepath)}')
print('Done.')
