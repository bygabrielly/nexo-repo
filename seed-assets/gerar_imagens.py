"""Gera as imagens ilustrativas usadas nos dados de demonstração do Nexo
(portfólios e capas). São ilustrações criadas para o protótipo, não trabalhos
reais de terceiros."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
OUT = os.path.dirname(os.path.abspath(__file__))
GF = '/usr/share/fonts/truetype/google-fonts/'
def font(name, size):
    for p in [GF + name, '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def grad(w, h, c1, c2, diag=True):
    im = Image.new('RGB', (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            t = ((x / w) + (y / h)) / 2 if diag else y / h
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return im

def rr(d, box, r, fill, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

# ---------- capas ----------
def cover(name, c1, c2, circles):
    im = grad(1400, 400, c1, c2)
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for (x, y, r, a) in circles:
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, a))
    im = Image.alpha_composite(im.convert('RGBA'), ov.filter(ImageFilter.GaussianBlur(2))).convert('RGB')
    im.save(os.path.join(OUT, name), optimize=True)

cover('capa-marina.png', (61, 15, 82), (244, 114, 182), [(1150, 60, 220, 40), (250, 330, 160, 30), (700, -40, 180, 25)])
cover('capa-rafael.png', (18, 40, 72), (40, 120, 150), [(1200, 300, 240, 30), (180, 60, 140, 25), (760, 380, 120, 20)])
cover('capa-juliana.png', (120, 50, 20), (240, 180, 90), [(1100, 100, 200, 35), (300, 350, 170, 25)])

# ---------- portfólio: design (Marina) ----------
def brand_card(name, bg, fg, word, sub, symbol):
    im = Image.new('RGB', (800, 600), bg); d = ImageDraw.Draw(im)
    rr(d, (140, 120, 660, 480), 28, (255, 255, 255))
    cx, cy = 400, 250
    if symbol == 'circle':
        d.ellipse((cx - 55, cy - 55, cx + 55, cy + 55), fill=fg); d.ellipse((cx - 25, cy - 25, cx + 25, cy + 25), fill=(255, 255, 255))
    elif symbol == 'leaf':
        d.pieslice((cx - 70, cy - 60, cx + 70, cy + 80), 200, 340, fill=fg); d.line((cx - 40, cy + 40, cx + 45, cy - 30), fill=(255, 255, 255), width=6)
    else:
        d.polygon([(cx, cy - 65), (cx + 60, cy + 45), (cx - 60, cy + 45)], fill=fg)
    f1 = font('Poppins-Bold.ttf', 46); f2 = font('Poppins-Regular.ttf', 22)
    w = d.textlength(word, font=f1); d.text((cx - w / 2, cy + 80), word, fill=fg, font=f1)
    w = d.textlength(sub, font=f2); d.text((cx - w / 2, cy + 140), sub, fill=(120, 110, 130), font=f2)
    for i, c in enumerate([fg, bg, (60, 55, 70), (230, 225, 235)]):
        d.ellipse((560 + i * 0, 0, 0, 0), fill=c) if False else None
        rr(d, (180 + i * 70, 500, 230 + i * 70, 550), 10, c, outline=(255, 255, 255), width=3)
    im.save(os.path.join(OUT, name), optimize=True)

brand_card('port-marina-1.png', (120, 45, 160), (154, 43, 191), 'Studio Fit', 'academia boutique', 'triangle')
brand_card('port-marina-2.png', (32, 96, 104), (30, 110, 120), 'Café Aroma', 'cafeteria artesanal', 'circle')
brand_card('port-marina-3.png', (70, 120, 60), (70, 130, 60), 'Verde Vivo', 'floricultura', 'leaf')

# ---------- portfólio: programação (Rafael) ----------
def site_mock(name, accent, title, variant):
    im = Image.new('RGB', (800, 600), (236, 240, 245)); d = ImageDraw.Draw(im)
    rr(d, (40, 40, 760, 560), 16, (255, 255, 255), outline=(210, 215, 225), width=2)
    d.rectangle((40, 40, 760, 80), fill=(225, 229, 236))
    for i, c in enumerate([(240, 90, 90), (245, 190, 70), (90, 200, 110)]):
        d.ellipse((60 + i * 22, 53, 74 + i * 22, 67), fill=c)
    rr(d, (140, 50, 660, 70), 8, (255, 255, 255))
    d.rectangle((40, 80, 760, 250), fill=accent)
    f1 = font('Poppins-Bold.ttf', 34); f2 = font('Poppins-Regular.ttf', 18)
    d.text((80, 125), title, fill=(255, 255, 255), font=f1)
    d.text((80, 175), 'Atendimento rápido, resultado garantido', fill=(235, 240, 250), font=f2)
    rr(d, (80, 210, 230, 238), 12, (255, 255, 255))
    if variant == 0:
        for i in range(3):
            x = 80 + i * 225; rr(d, (x, 280, x + 195, 520), 12, (244, 246, 250), outline=(220, 224, 232))
            d.ellipse((x + 20, 300, x + 70, 350), fill=accent)
            for j in range(4): rr(d, (x + 20, 370 + j * 30, x + 175 - j * 25, 384 + j * 30), 6, (215, 220, 230))
    else:
        rr(d, (80, 280, 420, 520), 12, (244, 246, 250), outline=(220, 224, 232))
        for j in range(6): rr(d, (100, 305 + j * 34, 400 - (j % 3) * 60, 321 + j * 34), 6, (215, 220, 230))
        rr(d, (450, 280, 720, 520), 12, accent)
        for j in range(5): d.rectangle((480 + j * 45, 480 - (j + 2) * 30, 510 + j * 45, 490), fill=(255, 255, 255))
    im.save(os.path.join(OUT, name), optimize=True)

site_mock('port-rafael-1.png', (38, 99, 235), 'Contábil Silva', 0)
site_mock('port-rafael-2.png', (16, 150, 120), 'Painel de Vendas', 1)
site_mock('port-rafael-3.png', (190, 60, 90), 'Clínica Sorriso', 0)

# ---------- portfólio: redação (Juliana) ----------
def article(name, accent, headline, tag):
    im = Image.new('RGB', (800, 600), (250, 247, 242)); d = ImageDraw.Draw(im)
    rr(d, (110, 40, 690, 560), 14, (255, 255, 255), outline=(225, 220, 210), width=2)
    rr(d, (150, 80, 150 + 16 * len(tag) + 20, 110), 12, accent)
    d.text((162, 83), tag, fill=(255, 255, 255), font=font('Poppins-Bold.ttf', 18))
    f1 = font('Poppins-Bold.ttf', 30)
    y = 130
    for line in headline:
        d.text((150, y), line, fill=(40, 35, 45), font=f1); y += 42
    y += 20
    rr(d, (150, y, 650, y + 150), 10, (240, 234, 224)); y += 180
    for j in range(6):
        rr(d, (150, y + j * 24, 650 - (j % 4) * 45, y + j * 24 + 10), 5, (220, 215, 205))
    im.save(os.path.join(OUT, name), optimize=True)

article('port-juliana-1.png', (200, 110, 40), ['10 dicas para vender', 'mais no Instagram'], 'MARKETING')
article('port-juliana-2.png', (60, 120, 180), ['Como escolher um', 'plano de saúde'], 'GUIA')
article('port-juliana-3.png', (120, 80, 160), ['O que é SEO e por que', 'sua empresa precisa'], 'SEO')
print('ok')
