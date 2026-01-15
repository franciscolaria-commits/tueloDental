from app import create_app, db
from app.models import Product

app = create_app()

with app.app_context():
    # Verificamos si ya hay productos para no duplicar
    if Product.query.count() == 0:
        p1 = Product(name="Remera Básica", description="100% Algodón", price=15000, image_url="https://via.placeholder.com/300/0000FF/808080")
        p2 = Product(name="Jean Slim Fit", description="Corte moderno", price=45000, image_url="https://via.placeholder.com/300/FF0000/FFFFFF")
        p3 = Product(name="Zapatillas Run", description="Para correr rápido", price=80000, image_url="https://via.placeholder.com/300/FFFF00/000000")
        
        db.session.add_all([p1, p2, p3])
        db.session.commit()
        print("¡Productos de prueba cargados!")
    else:
        print("Ya existen productos en la base de datos.")