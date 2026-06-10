from PIL import Image

src = 'src-tauri/icons/logo.png'
dst = 'src-tauri/icons/icon.ico'

img = Image.open(src)
# ensure RGBA
if img.mode not in ('RGBA', 'RGB'):
    img = img.convert('RGBA')
# create sizes
sizes = [(16,16),(32,32),(48,48),(64,64),(128,128)]
img.save(dst, format='ICO', sizes=sizes)
print('Wrote', dst)
