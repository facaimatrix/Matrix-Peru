"""Generates the MatrixPro Peru user guide PDF in Spanish.

    pip install fpdf2
    python generate_guide.py

Screenshots are read from docs_img/ next to this script.
"""
import json
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

HERE = Path(__file__).resolve().parent
VERSION = json.loads((HERE / "src-tauri/tauri.conf.json").read_text(encoding="utf-8"))["version"]

GOLD   = (209, 172, 0)
TEAL   = (0, 169, 157)
DARK   = (12, 22, 24)
CREAM  = (250, 244, 211)
PEACH  = (246, 190, 154)
WHITE  = (255, 255, 255)
LGRAY  = (230, 230, 230)
MGRAY  = (100, 100, 100)


class GuidePDF(FPDF):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.core_fonts_encoding = "windows-1252"   # accents, bullets, dashes

    def header(self):
        # dark bar
        self.set_fill_color(*DARK)
        self.rect(0, 0, 210, 14, "F")
        # gold accent line
        self.set_fill_color(*GOLD)
        self.rect(0, 13.5, 210, 0.8, "F")
        # logo box
        self.set_fill_color(*TEAL)
        self.set_draw_color(*GOLD)
        self.set_line_width(0.4)
        self.rect(7, 2, 10, 10, "FD")
        self.set_font("Helvetica", "B", 7)
        self.set_text_color(*GOLD)
        self.set_xy(7, 4.5)
        self.cell(10, 5, "MP", align="C")
        # title
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*CREAM)
        self.set_xy(20, 3)
        self.cell(0, 5, "MatrixPro Peru", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("Helvetica", "", 6.5)
        self.set_text_color(*PEACH)
        self.set_x(20)
        self.cell(0, 4, "Simulador de Crecimiento Forestal Basado en Modelo Matricial")
        self.ln(8)

    def footer(self):
        self.set_y(-12)
        self.set_fill_color(*DARK)
        self.rect(0, self.get_y() - 2, 210, 14, "F")
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*MGRAY)
        self.cell(0, 8, f"Versión {VERSION}  ·  Página {self.page_no()}", align="C")

    # ── helpers ──────────────────────────────────────────────────────────────

    def room(self, mm):
        """Start a new page unless this much space is left."""
        if self.get_y() + mm > self.h - self.b_margin:
            self.add_page()

    def figure(self, name, caption, w=176):
        path = HERE / "docs_img" / name
        info = self.image_size(path)
        h = w * info[1] / info[0]
        self.room(h + 9)
        y = self.get_y() + 1
        self.image(str(path), x=(self.w - w) / 2, y=y, w=w)
        self.set_y(y + h + 1)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*MGRAY)
        self.multi_cell(0, 4, caption, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)

    @staticmethod
    def image_size(path):
        from PIL import Image                       # installed with fpdf2
        with Image.open(path) as im:
            return im.size

    def note(self, text, color=GOLD):
        self.set_font("Helvetica", "", 9)
        lines = self.multi_cell(180, 4.8, text, dry_run=True, output="LINES")
        h = 4.8 * len(lines) + 4
        self.room(h + 2)
        y = self.get_y() + 1
        self.set_fill_color(250, 246, 228)
        self.rect(self.l_margin, y, 190, h, "F")
        self.set_fill_color(*color)
        self.rect(self.l_margin, y, 2, h, "F")
        self.set_xy(self.l_margin + 6, y + 2)
        self.set_text_color(60, 50, 20)
        self.multi_cell(180, 4.8, text)
        self.set_y(y + h + 2)

    def h1(self, text):
        self.room(30)
        self.ln(3)
        self.set_fill_color(*DARK)
        self.rect(self.l_margin, self.get_y(), 190, 9, "F")
        self.set_fill_color(*GOLD)
        self.rect(self.l_margin, self.get_y(), 2.5, 9, "F")
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(*GOLD)
        self.set_x(self.l_margin + 5)
        self.cell(0, 9, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)

    def h2(self, text):
        self.room(22)
        self.ln(2)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*TEAL)
        self.cell(0, 7, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        # underline
        self.set_draw_color(*TEAL)
        self.set_line_width(0.3)
        y = self.get_y()
        self.line(self.l_margin, y, self.l_margin + 190, y)
        self.ln(2)

    def body(self, text):
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(1)

    def bullet(self, label, desc=""):
        self.room(14)
        self.set_x(self.l_margin + 4)
        self.set_font("Helvetica", "B", 9.5)
        self.set_text_color(*TEAL)
        self.cell(3, 5.5, "•")
        if desc:
            self.set_font("Helvetica", "B", 9.5)
            self.set_text_color(30, 30, 30)
            self.cell(0, 5.5, label + "  ", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            self.set_x(self.l_margin + 10)
            self.set_font("Helvetica", "", 9)
            self.set_text_color(70, 70, 70)
            self.multi_cell(0, 5, desc)
        else:
            self.set_font("Helvetica", "", 9.5)
            self.set_text_color(40, 40, 40)
            self.cell(0, 5.5, label, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(0.5)

    def table(self, headers, rows, col_widths):
        def header():
            self.set_fill_color(*DARK)
            self.set_text_color(*GOLD)
            self.set_font("Helvetica", "B", 9)
            self.set_draw_color(*TEAL)
            self.set_line_width(0.2)
            for w, h in zip(col_widths, headers):
                self.cell(w, 7, h, border=1, fill=True, align="C")
            self.ln()

        self.room(24)
        header()
        for ri, row in enumerate(rows):
            self.set_font("Helvetica", "", 9)
            cells = [self.multi_cell(w - 2, 4.6, c, dry_run=True, output="LINES") for w, c in zip(col_widths, row)]
            h = 4.6 * max(len(c) for c in cells) + 2
            if self.get_y() + h > self.h - self.b_margin:
                self.add_page()
                header()
                self.set_font("Helvetica", "", 9)
            x, y = self.l_margin, self.get_y()
            for w, c in zip(col_widths, row):
                self.set_fill_color(*((240, 248, 247) if ri % 2 == 0 else WHITE))
                self.rect(x, y, w, h, "DF")
                self.set_xy(x + 1, y + 1)
                self.set_text_color(30, 30, 30)
                self.multi_cell(w - 2, 4.6, c, align="L")
                x += w
            self.set_xy(self.l_margin, y + h)
        self.ln(2)

    def code_box(self, text):
        self.ln(1)
        self.set_fill_color(20, 30, 32)
        y0 = self.get_y()
        self.rect(self.l_margin, y0, 190, 10, "F")
        self.set_fill_color(*GOLD)
        self.rect(self.l_margin, y0, 2, 10, "F")
        self.set_font("Courier", "", 8.5)
        self.set_text_color(*CREAM)
        self.set_xy(self.l_margin + 5, y0 + 1.5)
        self.cell(0, 7, text)
        self.ln(12)


# ── Build document ────────────────────────────────────────────────────────────

pdf = GuidePDF(orientation="P", unit="mm", format="A4")
pdf.set_title(f"MatrixPro Peru {VERSION} - Guía de uso")
pdf.set_margins(10, 20, 10)
pdf.set_auto_page_break(auto=True, margin=16)
pdf.add_page()

# ── Intro ─────────────────────────────────────────────────────────────────────
pdf.h1("¿Qué hace la aplicación?")
pdf.body(
    "MatrixPro Peru simula el crecimiento de un bosque tropical a lo largo del tiempo "
    "usando un modelo matricial de transición por clases de DAP (diámetro a la altura "
    "del pecho). El modelo predice cómo evoluciona la estructura del rodal año a año, "
    "considerando reclutamiento, crecimiento y mortalidad según el contexto ecológico "
    "(clase GEC) de la ubicación elegida."
)

pdf.h1("Novedades de la versión 1.1.0")
pdf.bullet("Vista del Rodal", "Nueva subpestaña que dibuja el rodal simulado año a año, con los árboles creciendo, muriendo y siendo cosechados.")
pdf.bullet("Árboles por género", "Formas de árboles según los géneros más comunes de cada zona, con alturas tomadas del inventario.")
pdf.bullet("Exportar GIF, video MP4 y PNG", "Para usar la animación en presentaciones e informes.")
pdf.bullet("Máscara forestal", "Ahora funciona: en versiones anteriores todos los puntos se aceptaban como bosque.")
pdf.bullet("Descarga de CSV", "La ventana de guardado ya no bloquea la aplicación.")

# ── Instalación ───────────────────────────────────────────────────────────────
pdf.h1("Instalación")
pdf.body(
    "Requiere Windows 10 u 11 (64 bits). Descargue el instalador .exe o .msi, ejecútelo y siga los "
    "pasos en pantalla. No es necesario instalar R. Se necesita conexión a Internet, "
    "porque el mapa y los gráficos se cargan de la web."
)
pdf.body("El idioma se cambia con los botones ES / EN en la parte superior derecha.")

# ── Pestaña de Entrada ────────────────────────────────────────────────────────
pdf.room(140)
pdf.h1("Pestaña Parámetros de Entrada")
pdf.figure("entrada.png", "Parámetros de Entrada: ubicación, estado del rodal y parámetros de simulación.")

pdf.h2("1. Seleccionar una ubicación")
pdf.body(
    "Haga clic en el mapa del Perú o ingrese las coordenadas en los campos Latitud y Longitud. "
    "El mapa muestra los límites departamentales y debajo de las coordenadas aparece el departamento. "
    "Se puede alternar entre OpenStreetMap e imagen satelital."
)
pdf.note(
    "Máscara forestal: si el punto cae fuera del área boscosa, aparece una advertencia, los valores del estado "
    "inicial se ponen en cero y el autocompletado no está disponible. La máscara es estricta: alrededor del 30 % de las "
    "parcelas de la base de datos (cerca de la mitad en zonas montañosas) se consideran no forestales. En ese caso puede elegir "
    "un punto cercano o ingresar el rodal manualmente."
)

pdf.h2("2. Estado Inicial del Rodal")
pdf.body(
    "Define cuántos árboles hay por hectárea en cada clase de DAP al inicio de la simulación "
    "(13 clases: 10-15 cm, 15-20 cm, ... hasta 70 cm o más)."
)
pdf.bullet("Ingresar Manualmente", "Escriba los valores de árboles por hectárea directamente en la tabla.")
pdf.bullet("Autocompletar desde Mapa",
           "Busca la parcela más cercana a sus coordenadas y rellena automáticamente los valores por clase de DAP.")

pdf.h2("3. Estado Objetivo del Rodal")
pdf.body(
    "Define la estructura que debe quedar después de cada cosecha. En cada año de cosecha, los árboles que "
    "superan el objetivo en una clase de DAP se cortan; si hay menos que el objetivo, no se corta ninguno."
)
pdf.bullet("Ingresar Manualmente", "Ingrese valores propios de estructura objetivo.")
pdf.bullet("Igual al Inicial", "Copia el rodal inicial: en cada cosecha se extrae solo lo que creció por encima de él.")

pdf.h2("4. Parámetros de Simulación")
pdf.table(
    ["Campo", "Descripción", "Rango"],
    [
        ["Duración (años)", "Cuántos años simular", "1 – 500"],
        ["Año de Primera Cosecha", "En qué año ocurre la primera extracción. Si es mayor que la duración, no hay cosecha.", "1 – 500"],
        ["Ciclo de Corta (años)", "Cada cuántos años se repite la cosecha", "1 – 200"],
    ],
    [52, 110, 28],
)

pdf.h2("5. Ejecutar y Exportar")
pdf.bullet("Ejecutar Simulación", "Corre el modelo matricial y cambia automáticamente a la pestaña Resultados.")
pdf.bullet("Obtener Datos",
           "Descarga un CSV con las coordenadas, la fila de la parcela emparejada y los vectores de rodal inicial "
           "y objetivo; útil para reproducir exactamente la simulación.")

# ── Pestaña de Resultados ─────────────────────────────────────────────────────
pdf.h1("Pestaña Resultados")
pdf.body(
    "Tiene cinco subpestañas. Las cuatro primeras muestran gráficos de líneas y una tabla anual con todos los "
    "valores; las líneas verticales discontinuas marcan los años de cosecha y el botón Descargar CSV guarda los datos. "
    "La quinta es la Vista del Rodal."
)
pdf.table(
    ["Subpestaña", "Qué muestra"],
    [
        ["Árboles por Hectárea", "TPH total y por clase de DAP. Filas resaltadas = año de cosecha."],
        ["Área Basal", "m²/ha totales, cambio y % de cambio respecto al año anterior."],
        ["Biomasa", "Biomasa aérea en Mg/ha según la clase ecológica GEC de la parcela."],
        ["Índices de Diversidad", "Shannon (H') y Simpson (D) calculados año a año sobre las clases de DAP."],
        ["Vista del Rodal", "Animación del rodal simulado, con exportación a GIF, video MP4 y PNG."],
    ],
    [52, 138],
)

# ── Vista del Rodal ───────────────────────────────────────────────────────────
pdf.room(135)
pdf.h1("Vista del Rodal")
pdf.body(
    "Dibuja la parcela simulada árbol por árbol. El panel derecho muestra el año, los totales por hectárea, la distribución "
    "por clase de DAP (la marca clara es el rodal objetivo y el naranja lo cosechado ese año), una planta y la evolución del área basal."
)
pdf.figure("vista_rodal.png", "Vista en perspectiva. Los jalones de las esquinas tienen bandas cada 10 m.")

pdf.h2("Controles")
pdf.table(
    ["Control", "Función"],
    [
        ["Reproducir / Pausa", "Anima la simulación (también con la barra espaciadora). Las flechas y la barra deslizante cambian de año."],
        ["Vista", "Perspectiva (arrastre para girar, rueda para acercar), Perfil (franja por el centro de la parcela) o Planta (copas desde arriba)."],
        ["Parcela", "1 ha (100 × 100 m) o ¼ ha (50 × 50 m)."],
        ["Formas", "Por género, o formas genéricas."],
        ["Composición", "Mezcla de la ecozona; un género dominante con su porcentaje (100 % = monocultivo); o una lista propia de géneros y porcentajes. Solo cambia el dibujo."],
        ["Velocidad", "Años simulados por segundo; también define la duración del GIF y del video."],
        ["Muertos en pie / Tocones", "Muestra los árboles muertos por 4 años y los tocones por 8 años, desvaneciéndose."],
        ["Nueva distribución", "Cambia al azar las posiciones y los géneros de los árboles."],
        ["Restablecer vista", "Devuelve la cámara a su posición original."],
    ],
    [52, 138],
)
pdf.figure("vista_perfil.png", "Vista de perfil con formas por género.")

pdf.h2("Exportar")
pdf.table(
    ["Botón", "Resultado", "Opciones"],
    [
        ["Guardar PNG", "Imagen fija del año actual, 2400 × 1280 píxeles.", "–"],
        ["Exportar GIF", "Animación de un cuadro por año, o menos si la simulación es larga. Los años de cosecha siempre se incluyen.", "Ancho y número de cuadros"],
        ["Exportar video", "Video MP4 (H.264) a 30 cuadros por segundo, con crecimiento y corta animados. Máximo 3 minutos: si hace falta, la velocidad se aumenta.", "Tamaño"],
    ],
    [36, 112, 42],
)
pdf.body(
    "Mientras se exporta, el botón muestra el avance y permite cancelar. La exportación usa la vista, las formas y el idioma "
    "elegidos. Si el equipo no puede codificar video H.264, use el GIF."
)

pdf.h2("Qué es resultado del modelo y qué es ilustrativo")
pdf.bullet("Resultado del modelo",
           "El número de árboles: en cada año y clase de DAP se dibujan los árboles/ha simulados por el área de la parcela, "
           "redondeados. El reclutamiento, el crecimiento, la mortalidad y la cosecha siguen las tasas del modelo.")
pdf.bullet("Tomado del inventario",
           "Las alturas (medianas por zona y clase de DAP; pueden ser estimaciones visuales de campo) y la frecuencia de los géneros.")
pdf.bullet("Ilustrativo",
           "Las posiciones, las formas y anchos de copa, y el género de cada árbol.")
pdf.note(
    "El modelo no simula especies. Salvo que se indique una composición, a cada árbol se le asigna un género según su frecuencia observada por zona ecológica y "
    "clase de DAP; esa mezcla no responde a la cosecha ni al tiempo. Los géneros poco comunes y los árboles no identificados "
    "se dibujan con formas genéricas. No use la animación para sacar conclusiones sobre composición florística."
)
pdf.table(
    ["Zona (GEC)", "Árboles del inventario", "Dibujados por género"],
    [["Bosque lluvioso tropical (SA_11)", "51 708", "71 %"], ["Sistema montañoso tropical (SA_16)", "7 815", "78 %"], ["Bosque seco tropical (SA_13)", "1 264", "95 %"]],
    [90, 50, 50],
)

# ── Flujo típico ──────────────────────────────────────────────────────────────
pdf.h1("Flujo típico de uso")
pdf.code_box("Mapa > Autocompletar > objetivo y parámetros > Ejecutar > resultados > Vista del Rodal > Exportar")
pdf.bullet("Consejo 1",
           "Use Autocompletar para obtener una línea de base realista del bosque en esa ubicación y luego ajuste "
           "manualmente si tiene datos de campo propios.")
pdf.bullet("Consejo 2",
           "Para simular el crecimiento sin intervención, ponga un Año de Primera Cosecha mayor que la duración. "
           "Igualar el objetivo al inicial no evita la cosecha: se corta lo que crece por encima del objetivo.")
pdf.bullet("Consejo 3",
           "Experimente con distintos ciclos de corta (5, 10, 20 años) para comparar su impacto en la biomasa y los "
           "índices de diversidad a largo plazo.")
pdf.bullet("Consejo 4",
           "El CSV de Obtener Datos incluye la fila completa de la parcela emparejada (variables ambientales, GEC, "
           "coordenadas); útil para análisis externos o para documentar el origen de los datos.")
pdf.bullet("Consejo 5",
           "Para comparar dos escenarios en una presentación, exporte un video de cada uno con la misma vista y velocidad.")

# ── Limitaciones ──────────────────────────────────────────────────────────────
pdf.h1("Limitaciones")
pdf.bullet("Reclutamiento",
           "El modelo de reclutamiento tiene pocos datos de entrenamiento en bosque seco (2 parcelas) y montaña (5 parcelas). "
           "Interprete con cautela las simulaciones largas sin cosecha en esas zonas.")
pdf.bullet("Parcela más cercana",
           "Las variables ambientales son las de la parcela más cercana; lejos de las parcelas disponibles, los resultados son menos confiables.")

out = HERE / "MatrixPro_Peru_Guia_de_Uso.pdf"
pdf.output(str(out))
print(f"PDF generado: {out.name}")
