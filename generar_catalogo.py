import csv
from fpdf import FPDF

# Configuración de archivos
CSV_FILE = "app/Catalogo_Insumos_2026_02_21.csv"
PDF_FILE = "app/tuelo_catalogo.pdf"

class PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, "Catálogo de Productos - Tuelo Dental 2026", border=False, ln=True, align="R")
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f"Página {self.page_no()}", align="C")

def clean_text(text):
    """Limpia caracteres raros para evitar errores en PDF básico"""
    if not text:
        return ""
    return str(text).replace("\r", "").replace("\n", " ").encode('latin-1', 'replace').decode('latin-1')

def generar_pdf():
    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    
    # --- PORTADA ---
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 24)
    pdf.cell(0, 20, "TUELO DENTAL", ln=True, align="C")
    pdf.set_font("Helvetica", "I", 14)
    pdf.cell(0, 10, "Insumos y Equipamiento Odontológico", ln=True, align="C")
    
    pdf.ln(20)
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 10, "Contacto: tuelodental@ymail.com | WhatsApp: +54 9 264 5510866", ln=True, align="C")
    pdf.cell(0, 10, "Web: https://tuelodental.onrender.com", ln=True, align="C")
    pdf.cell(0, 10, "Ubicación: Rivadavia, San Juan, Argentina", ln=True, align="C")
    pdf.ln(20)

    # --- LEER CSV ---
    productos = []
    try:
        with open(CSV_FILE, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                productos.append(row)
    except FileNotFoundError:
        print(f"❌ Error: No se encontró el archivo {CSV_FILE}")
        return

    # --- ÍNDICE ---
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Índice de Productos Destacados", ln=True)
    pdf.set_font("Helvetica", "", 11)
    
    for i, prod in enumerate(productos[:15], 1): # Mostrar los primeros 15 en el índice
        nombre = clean_text(prod.get("Nombre", "Producto"))
        precio = clean_text(prod.get("Precio", "0"))
        pdf.cell(0, 8, f"{i}. {nombre} - ${precio}", ln=True)
    
    # --- DETALLE DE PRODUCTOS ---
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Detalle de Productos", ln=True)
    pdf.ln(5)

    for prod in productos:
        nombre = clean_text(prod.get("Nombre", ""))
        precio = clean_text(prod.get("Precio", ""))
        cat = clean_text(prod.get("Categoria", ""))
        desc = clean_text(prod.get("Descripcion", ""))

        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, f"{nombre}", ln=True)
        
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(0, 100, 0) # Verde para el precio
        pdf.cell(0, 6, f"Precio: ${precio} | Categoría: {cat}", ln=True)
        pdf.set_text_color(0, 0, 0)
        
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, f"Descripción: {desc}")
        pdf.ln(5)

    # --- POLÍTICAS DE COMPRA ---
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Políticas de Compra - Tuelo Dental", ln=True)
    pdf.ln(10)

    politicas = [
        ("Envíos", "Realizamos envíos a todo el país. La compra mínima para despachos es de $100.000. Actualmente no contamos con promociones de envío gratis."),
        ("Medios de Pago", "Aceptamos todos los medios de pago habilitados. Aprovechá un 10% de descuento abonando en efectivo."),
        ("Cambios y Devoluciones", "Por cuestiones de bioseguridad, las devoluciones o cambios deben ser consultados previamente a través de nuestro WhatsApp oficial (+54 9 264 5510866).")
    ]

    for titulo, texto in politicas:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, titulo, ln=True)
        pdf.set_font("Helvetica", "", 11)
        pdf.multi_cell(0, 6, texto)
        pdf.ln(5)

    # --- GUARDAR ---
    pdf.output(PDF_FILE)
    print(f"✅ PDF generado con éxito en: {PDF_FILE}")

if __name__ == "__main__":
    generar_pdf()