from app import create_app, db
from app.models import Product, User

app = create_app()

with app.app_context():
    # 1. Crear Usuario Admin por defecto (para que no tengas que registrarte siempre)
    if not User.query.filter_by(email='admin@dental.com').first():
        admin = User(username='AdminDental', email='admin@dental.com', is_admin=True)
        admin.set_password('@adrianDuenio2026') # La contraseña es @adrianDuenio2026
        db.session.add(admin)
        print("👤 Usuario Admin creado (admin@dental.com / @adrianDuenio2026)")