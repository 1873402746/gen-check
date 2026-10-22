"""iconize.py —— 把 AI 生成的浅底图批量抠成透明 PNG，并统一尺寸。

用法：python tools/iconize.py
输入：assets/raw/*.png（按文件时间排序，顺序对应 NAMES）
输出：assets/pat/<name>.png（192x192 透明，主体最长边占 88%）
      tools/shots/pat-preview.png（4x3 预览拼图，人眼验收用）

核心：背景不是真透明，需要自己抠。用「颜色相似 + 从边界连通传播」判定背景，
      这样主体内部的浅色区域（羊的白毛、白菜的白帮、蘑菇的白点）不会被误抠成洞。
"""
import os
import glob
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = ['carrot', 'cabbage', 'corn', 'apple', 'mushroom', 'strawberry',
         'sheep', 'eggplant', 'banana', 'peach', 'lemon', 'grape']
OUT_SIZE = 160
FILL = 0.92          # 主体最长边占画布比例
THRESH = 44          # 与背景色的最大通道差阈值
SHRINK = 1           # 背景掩膜向内膨胀像素数（吃掉边缘过渡白边）


def dilate(m):
    out = m.copy()
    out[1:, :] |= m[:-1, :]
    out[:-1, :] |= m[1:, :]
    out[:, 1:] |= m[:, :-1]
    out[:, :-1] |= m[:, 1:]
    return out


def matte(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape

    edge = np.concatenate([a[0, :, :], a[-1, :, :], a[:, 0, :], a[:, -1, :]], axis=0)
    bg = np.median(edge, axis=0)
    dist = np.abs(a - bg).max(axis=2)
    cand = dist < THRESH

    reach = np.zeros((h, w), bool)
    reach[0, :] = cand[0, :]
    reach[-1, :] |= cand[-1, :]
    reach[:, 0] |= cand[:, 0]
    reach[:, -1] |= cand[:, -1]
    for _ in range(5000):
        nxt = dilate(reach) & cand
        if nxt.sum() == reach.sum():
            break
        reach = nxt

    for _ in range(SHRINK):
        reach = dilate(reach)

    alpha = np.where(reach, 0, 255).astype(np.uint8)
    alpha_im = Image.fromarray(alpha, 'L').filter(ImageFilter.GaussianBlur(0.65))
    rgba = im.convert('RGBA')
    rgba.putalpha(alpha_im)

    solid = alpha_im.point(lambda v: 255 if v > 12 else 0)
    bbox = solid.getbbox()
    if not bbox:
        raise RuntimeError('empty matte: ' + path)
    crop = rgba.crop(bbox)

    k = (OUT_SIZE * FILL) / max(crop.width, crop.height)
    nw, nh = max(1, round(crop.width * k)), max(1, round(crop.height * k))
    crop = crop.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new('RGBA', (OUT_SIZE, OUT_SIZE), (0, 0, 0, 0))
    canvas.paste(crop, ((OUT_SIZE - nw) // 2, (OUT_SIZE - nh) // 2), crop)
    return canvas, (bbox[2] - bbox[0], bbox[3] - bbox[1]), bg


def main():
    files = sorted(glob.glob(os.path.join(ROOT, 'assets/raw/*.png')), key=os.path.getmtime)
    if len(files) < len(NAMES):
        raise SystemExit('需要 %d 张原图，实际 %d 张' % (len(NAMES), len(files)))
    outdir = os.path.join(ROOT, 'assets/pat')
    os.makedirs(outdir, exist_ok=True)

    icons = []
    for name, f in zip(NAMES, files):
        icon, box, bg = matte(f)
        icon.save(os.path.join(outdir, name + '.png'), optimize=True)
        icons.append(icon)
        print('%-10s bbox=%sx%s bg=%s -> %dKB' % (
            name, box[0], box[1], tuple(int(x) for x in bg),
            os.path.getsize(os.path.join(outdir, name + '.png')) // 1024))

    # 预览拼图
    cell, cols = OUT_SIZE, 4
    rows = (len(icons) + cols - 1) // cols
    pad = 18
    W = cols * cell + (cols + 1) * pad
    H = rows * cell + (rows + 1) * pad
    sheet = Image.new('RGB', (W, H), (252, 246, 238))
    for i, ic in enumerate(icons):
        x = pad + (i % cols) * (cell + pad)
        y = pad + (i // cols) * (cell + pad)
        tile = Image.new('RGBA', (cell, cell), (255, 255, 255, 255))
        tile.paste(ic, (0, 0), ic)
        sheet.paste(tile.convert('RGB'), (x, y))
    shots = os.path.join(ROOT, 'tools/shots')
    os.makedirs(shots, exist_ok=True)
    sheet.save(os.path.join(shots, 'pat-preview.png'))
    print('preview ->', os.path.join(shots, 'pat-preview.png'))


if __name__ == '__main__':
    main()
