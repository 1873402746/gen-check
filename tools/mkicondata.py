"""mkicondata.py —— 把牌面 PNG 打包成 base64 的 js/icons-data.js。

为什么不用相对路径直接 drawImage：海报是 Canvas 导出的，
`file://` 下 drawImage 本地图片会污染 canvas，toDataURL 直接抛 SecurityError。
内联成 data URI 就没有这个限制，双击 index.html 也能正常出海报。

体积控制：海报里图标只画到 ~110px，这里统一缩到 128px 再编码，约 300KB。
并且只在用户点「生成海报」时才按需加载这个文件，平时不占首屏。
"""
import base64
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = ['carrot', 'cabbage', 'corn', 'apple', 'mushroom', 'strawberry',
         'sheep', 'eggplant', 'banana', 'peach', 'lemon', 'grape']
SIZE = 128


def main():
    out = {}
    for name in NAMES:
        p = os.path.join(ROOT, 'assets/pat', name + '.png')
        im = Image.open(p).convert('RGBA')
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
        buf = os.path.join(ROOT, 'tools', '_tmp.png')
        canvas.save(buf, optimize=True)
        with open(buf, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode()
        os.remove(buf)
        out[name] = 'data:image/png;base64,' + b64

    js = ('/* icons-data.js —— 由 tools/mkicondata.py 生成，勿手改 */\n'
          '(function (G) {\n  G.ICON_DATA = ' + json.dumps(out, ensure_ascii=False) + ';\n'
          '})(window.G = window.G || {});\n')
    dst = os.path.join(ROOT, 'js/icons-data.js')
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    print('written %s  %.0f KB' % (dst, os.path.getsize(dst) / 1024))


if __name__ == '__main__':
    main()
