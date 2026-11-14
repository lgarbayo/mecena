#!/usr/bin/env python3
"""Draws the example invoices of the justification demo (IDEA #7): data/demo/invoices/*.png and public/demo/factura-ejemplo.png.

Usage: python3 scripts/demo-invoices.py   (needs Pillow and the DejaVu Sans fonts; output is the committed PNGs)

Everything on them is fictional: made-up suppliers, placeholder tax ids ("B-0000001x") and a plain layout drawn here.
They are released under CC0 1.0 (see data/demo/invoices/LICENSE.md). Keep the figures in sync with data/demo/justification.json.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
W, H = 900, 1240
INK, GREY, LINE, ACCENT = (28, 28, 34), (110, 110, 118), (200, 200, 205), (40, 70, 110)


def f(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def eur(n):
    return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") + " €"


INVOICES = [
    dict(file="data/demo/invoices/papeleria-sol.png", supplier="Papelería Sol, S.L.", taxId="B-00000011", address="Rúa do Real 41 · 15003 A Coruña",
         number="F-2026-0412", date="03/10/2026", items=[("Papel de algodón 300 g, 20 hojas 56×76", 640.00), ("Bloques de acuarela 36×51, 8 uds.", 385.21)], base=1025.21, vat=215.29),
    dict(file="data/demo/invoices/colores-atlantico.png", supplier="Colores do Atlántico, S.L.", taxId="B-00000012", address="Polígono da Grela, nave 7 · 15008 A Coruña",
         number="A-1893", date="17/10/2026", items=[("Pigmentos naturales (12 tarros)", 512.40), ("Aglutinante y medios, 6 uds.", 261.48)], base=773.88, vat=162.51),
    dict(file="data/demo/invoices/marqueteria-riazor.png", supplier="Marquetería Riazor", taxId="B-00000013", address="Avda. de Oza 18 · 15006 A Coruña",
         number="2026/0731", date="02/11/2026", items=[("Marcos de madera, 12 piezas", 1480.00), ("Vidrio museo y montaje", 668.76)], base=2148.76, vat=451.24),
    dict(file="public/demo/factura-ejemplo.png", supplier="Imprenta Ártabra, S.L.", taxId="B-00000014", address="Rúa Nova 9 · 15001 A Coruña",
         number="F-0087", date="09/11/2026", items=[("Edición e impresión de catálogo, 12 piezas", 1020.00), ("Encuadernación, 200 ejemplares", 178.35)], base=1198.35, vat=251.65),
]


def draw(inv):
    img = Image.new("RGB", (W, H), (238, 236, 230))
    page = Image.new("RGB", (W - 80, H - 80), (252, 251, 248))
    shadow = Image.new("RGB", (W, H), (238, 236, 230))
    ImageDraw.Draw(shadow).rectangle((46, 50, W - 34, H - 30), fill=(214, 212, 206))
    img = Image.blend(img, shadow.filter(ImageFilter.GaussianBlur(10)), 1)
    img.paste(page, (40, 40))
    d = ImageDraw.Draw(img)
    x0, x1, y = 90, W - 90, 90
    d.text((x0, y), inv["supplier"], font=f(34, True), fill=ACCENT)
    d.text((x0, y + 48), f"CIF {inv['taxId']}", font=f(21), fill=INK)
    d.text((x0, y + 78), inv["address"], font=f(21), fill=GREY)
    d.text((x1, y), "FACTURA", font=f(40, True), fill=INK, anchor="ra")
    d.text((x1, y + 56), f"Nº {inv['number']}", font=f(25, True), fill=INK, anchor="ra")
    d.text((x1, y + 92), f"Fecha: {inv['date']}", font=f(23), fill=INK, anchor="ra")
    y += 170
    d.line((x0, y, x1, y), fill=LINE, width=2)
    d.text((x0, y + 20), "CLIENTE", font=f(17, True), fill=GREY)
    d.text((x0, y + 46), "Antía Varela", font=f(25, True), fill=INK)
    d.text((x0, y + 80), "Rúa da Marea 12 · 15002 A Coruña", font=f(21), fill=GREY)
    y += 150
    d.rectangle((x0, y, x1, y + 46), fill=(232, 236, 242))
    d.text((x0 + 14, y + 10), "Concepto", font=f(20, True), fill=INK)
    d.text((x1 - 14, y + 10), "Importe", font=f(20, True), fill=INK, anchor="ra")
    y += 46
    for text, amount in inv["items"]:
        d.text((x0 + 14, y + 18), text, font=f(22), fill=INK)
        d.text((x1 - 14, y + 18), eur(amount), font=f(22), fill=INK, anchor="ra")
        y += 62
        d.line((x0, y, x1, y), fill=LINE, width=1)
    y += 50
    total = round(inv["base"] + inv["vat"], 2)
    for label, value, big in (("Base imponible", inv["base"], False), ("IVA 21 %", inv["vat"], False), ("TOTAL", total, True)):
        d.text((x1 - 300, y), label, font=f(29 if big else 22, big), fill=INK, anchor="ra")
        d.text((x1 - 14, y), eur(value), font=f(29 if big else 22, big), fill=ACCENT if big else INK, anchor="ra")
        y += 52 if big else 40
    d.text((x0, H - 170), "Pago por transferencia · Gracias por su confianza", font=f(20), fill=GREY)
    d.text((x0, H - 110), "Factura de ejemplo para la demo de Mecena · datos ficticios · CC0 1.0", font=f(17), fill=GREY)
    return img.rotate(0.6, resample=Image.BICUBIC, fillcolor=(238, 236, 230))


for inv in INVOICES:
    assert round(sum(a for _, a in inv["items"]), 2) == inv["base"], inv["number"]
    assert abs(inv["base"] * 0.21 - inv["vat"]) < 0.01, inv["number"]
    out = ROOT / inv["file"]
    out.parent.mkdir(parents=True, exist_ok=True)
    draw(inv).save(out, optimize=True)
    print("wrote", out.relative_to(ROOT), out.stat().st_size // 1024, "KB")
