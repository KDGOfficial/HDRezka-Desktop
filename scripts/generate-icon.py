import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('resources', exist_ok=True)

size = 256
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Rounded rectangle background
margin = 8
draw.rounded_rectangle(
    [(margin, margin), (size - margin, size - margin)],
    radius=48,
    fill=(229, 9, 20, 255) # HDRezka red
)

# Inner dark container
inner_margin = 28
draw.rounded_rectangle(
    [(inner_margin, inner_margin), (size - inner_margin, size - inner_margin)],
    radius=36,
    fill=(16, 17, 20, 255) # Dark surface
)

# Draw stylized "HD" and play symbol
# Play triangle
play_coords = [(110, 85), (170, 128), (110, 171)]
draw.polygon(play_coords, fill=(229, 9, 20, 255))

# Top ribbon / accents
draw.rounded_rectangle([(80, 195), (176, 205)], radius=4, fill=(229, 9, 20, 255))

img.save('resources/icon.png', format='PNG')

# Save multi-size ICO
icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save('resources/icon.ico', format='ICO', sizes=icon_sizes)
print("Icons generated successfully!")
