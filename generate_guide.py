"""Generates the MatrixPro Peru user guide PDF in Spanish."""
from fpdf import FPDF
from fpdf.enums import XPos, YPos

GOLD   = (209, 172, 0)
TEAL   = (0, 169, 157)
DARK   = (12, 22, 24)
CREAM  = (250, 244, 211)
PEACH  = (246, 190, 154)
WHITE  = (255, 255, 255)
LGRAY  = (230, 230, 230)
MGRAY  = (100, 100, 100)


class GuidePDF(FPDF):
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
        self.cell(0, 8, f"Página {self.page_no()}", align="C")

    # ── helpers ──────────────────────────────────────────────────────────────

    def h1(self, text):
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
        # header row
        self.set_fill_color(*DARK)
        self.set_text_color(*GOLD)
        self.set_font("Helvetica", "B", 9)
        self.set_draw_color(*TEAL)
        self.set_line_width(0.2)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], 7, h, border=1, fill=True, align="C")
        self.ln()
        # data rows
        self.set_font("Helvetica", "", 9)
        for ri, row in enumerate(rows):
            fill = ri % 2 == 0
            self.set_fill_color(240, 248, 247) if fill else self.set_fill_color(*WHITE)
            self.set_text_color(30, 30, 30)
            for i, cell in enumerate(row):
                self.cell(col_widths[i], 6.5, cell, border=1, fill=True)
            self.ln()
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
pdf.set_margins(10, 20, 10)
pdf.set_auto_page_break(auto=True, margin=16)
pdf.add_page()

# ── Intro ─────────────────────────────────────────────────────────────────────
pdf.h1("Que hace la aplicacion?")
pdf.body(
    "MatrixPro Peru simula el crecimiento de un bosque tropical a lo largo del tiempo "
    "usando un modelo matricial de transicion por clases de DAP (diametro a la altura "
    "del pecho). El modelo predice como evoluciona la estructura del rodal ano a ano, "
    "considerando reclutamiento, crecimiento y mortalidad segun el contexto ecologico "
    "(clase GEC) de la ubicacion elegida."
)

# ── Pestana de Entrada ────────────────────────────────────────────────────────
pdf.h1("Pestana de Entrada")

pdf.h2("1. Seleccionar una ubicacion")
pdf.body(
    "Haz clic en el mapa de Peru o ingresa coordenadas manualmente en los campos de "
    "Latitud / Longitud. El mapa muestra las fronteras departamentales y al hacer "
    "clic aparece un indicador del departamento. Si tienes la mascara forestal "
    "cargada, recibiras una advertencia inmediata si el punto cae fuera del area boscosa."
)

pdf.h2("2. Estado Inicial del Rodal")
pdf.body(
    "Define cuantos arboles hay por hectarea en cada clase de DAP al inicio de la simulacion "
    "(clases: 10-15 cm, 15-20 cm, ... hasta >= 70 cm)."
)
pdf.bullet("Ingresar Manualmente", "Escribe los valores de TPH directamente en la tabla.")
pdf.bullet("Autocompletar desde Mapa",
           "El sistema busca la parcela de inventario mas cercana a tus coordenadas "
           "y rellena automaticamente los valores de DAP.")

pdf.h2("3. Estado Objetivo del Rodal")
pdf.body(
    "Define la estructura de rodal deseada al final del periodo. El simulador ajusta "
    "las cosechas para acercarse a ese objetivo."
)
pdf.bullet("Ingresar Manualmente", "Ingresa valores propios de estructura objetivo.")
pdf.bullet("Igual al Inicial",
           "Copia automaticamente el rodal inicial (sin cambio estructural como meta).")

pdf.h2("4. Parametros de Simulacion")
pdf.table(
    ["Campo", "Descripcion", "Rango"],
    [
        ["Duracion (anos)", "Cuantos anos simular", "1 – 500"],
        ["Ano de Primera Cosecha", "En que ano ocurre la primera extraccion", "1 – 500"],
        ["Ciclo de Corta (anos)", "Con que frecuencia se repite la cosecha", "1 – 200"],
    ],
    [62, 100, 28],
)

pdf.h2("5. Ejecutar y Exportar")
pdf.bullet("Ejecutar Simulacion",
           "Corre el modelo matricial y cambia automaticamente a la pestana de resultados.")
pdf.bullet("Obtener Datos",
           "Descarga un CSV con las coordenadas, la fila de parcela emparejada y "
           "los vectores de rodal inicial y objetivo — util para reproducir exactamente "
           "la simulacion.")

# ── Pestana de Resultados ─────────────────────────────────────────────────────
pdf.h1("Pestana de Resultados")
pdf.body(
    "Cuatro subpestanas, cada una con un grafico de linea temporal mas una tabla anual "
    "con todos los valores. Las lineas verticales discontinuas en los graficos marcan "
    "los anos de cosecha. Cada subpestana tiene un boton Descargar CSV."
)

pdf.table(
    ["Subpestana", "Que muestra"],
    [
        ["Arboles por Hectarea",
         "TPH total y por clase de DAP. Filas en naranja = ano de cosecha."],
        ["Area Basal",
         "m2/ha totales + cambio y % de cambio respecto al ano anterior."],
        ["Biomasa",
         "Biomasa aerea en Mg/ha segun la clase ecologica GEC de la parcela."],
        ["Indices de Diversidad",
         "Shannon (H') y Simpson (D) calculados ano a ano."],
    ],
    [52, 138],
)

# ── Flujo tipico ──────────────────────────────────────────────────────────────
pdf.h1("Flujo Tipico de Uso")
pdf.code_box(
    "Clic en el mapa  ->  verificar departamento  ->  Autocompletar  ->"
    "  ajustar parametros  ->  Ejecutar  ->  explorar resultados  ->  Descargar CSV"
)

pdf.bullet("Tip 1",
           "Usa Autocompletar para obtener una linea de base realista del bosque en "
           "esa ubicacion, y luego ajusta manualmente si tienes datos de campo propios.")
pdf.bullet("Tip 2",
           "Establece el Estado Objetivo igual al Inicial para simular el crecimiento "
           "sin intervencion y evaluar la dinamica natural del rodal.")
pdf.bullet("Tip 3",
           "Experimenta con distintos ciclos de corta (5, 10, 20 anos) para comparar "
           "su impacto en la biomasa y los indices de diversidad a largo plazo.")
pdf.bullet("Tip 4",
           "El archivo CSV de Obtener Datos incluye la fila completa de la parcela "
           "emparejada (variables ambientales, GEC, coordenadas) — util para "
           "analisis externos o para documentar el origen de los datos de entrada.")

out = "MatrixPro_Peru_Guia_de_Uso.pdf"
pdf.output(out)
print(f"PDF generado: {out}")
