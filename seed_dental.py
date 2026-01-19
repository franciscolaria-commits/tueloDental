from app import create_app, db
from app.models import Product, User

app = create_app()

with app.app_context():
    # 1. Crear Usuario Admin por defecto (para que no tengas que registrarte siempre)
    if not User.query.filter_by(email='admin@dental.com').first():
        admin = User(username='AdminDental', email='admin@dental.com', is_admin=True)
        admin.set_password('admin123') # La contraseña es admin123
        db.session.add(admin)
        print("👤 Usuario Admin creado (admin@dental.com / admin123)")

    # 2. Cargar Productos Dentales
    if Product.query.count() == 0:
        products = [
            Product(name="Guantes de Látex (Caja x100)", category="Descartables", description="Descartables, talle M. Alta sensibilidad.", price=8500, stock=50, image_url="https://http2.mlstatic.com/D_NQ_NP_783637-MLA46660886734_072021-O.webp"),
            
            Product(name="Resina Compuesta 3M", category="Insumos", description="Filtek Z250. Jeringa 4g. Tono A2.", price=45000, stock=20, image_url="https://http2.mlstatic.com/D_NQ_NP_918518-MLA45648586737_042021-O.webp"),
            
            Product(name="Turbina Push Button", category="Equipamiento", description="Alta velocidad con luz LED. Conexión Borden.", price=180000, stock=5, image_url="https://http2.mlstatic.com/D_NQ_NP_608144-MLA51794751859_102022-O.webp"),
            
            Product(name="Kit Espejos Bucales x10", category="Instrumental", description="Acero inoxidable, mango antideslizante.", price=15000, stock=30, image_url="https://m.media-amazon.com/images/I/61S-l3yZFIL.jpg"),
            
            Product(name="Baberos Descartables x50", category="Descartables", description="Triple capa, impermeables. Color azul.", price=6500, stock=100, image_url="https://http2.mlstatic.com/D_NQ_NP_729445-MLA44686259871_012021-O.webp"),
            
            Product(name="Anestesia Lidocaína", category="Farmacia", description="Caja x50 carpules. Uso profesional exclusivo.", price=32000, stock=15, image_url="https://http2.mlstatic.com/D_NQ_NP_864821-MLA48827727192_012022-O.webp")
        ]
        
        db.session.add_all(products)
        db.session.commit()
        print("🦷 ¡Productos odontológicos cargados!")
    else:
        print("Ya existen productos.")