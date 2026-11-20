import os
from PIL import Image

os.makedirs('resources', exist_ok=True)
os.makedirs('src/renderer/assets', exist_ok=True)

logo_source = None
possible_sources = [
    'src/renderer/assets/logo.png',
    'resources/icon.png',
    r'C:/Users/Denial/.gemini/antigravity/brain/c0ff2e2e-cbe5-4d6f-998e-c76d2db6fb8c/.user_uploaded/media_1795170754719_5cc6b66c.jpg',
]

for src in possible_sources:
    if os.path.exists(src):
        logo_source = src
        break

if logo_source:
    img = Image.open(logo_source).convert('RGBA')
    icon_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save('resources/icon.png', format='PNG')
    icon_512.save('src/renderer/assets/logo.png', format='PNG')

    icon_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save('resources/icon.ico', format='ICO', sizes=icon_sizes)
    print("New HDRezka Desktop logo icons generated successfully from:", logo_source)
else:
    print("No logo source found.")
