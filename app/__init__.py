from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
import os

db = SQLAlchemy()
login_manager = LoginManager()

def create_app():
    app = Flask(__name__)
    
    # IMPORTANTE: Clave secreta
    app.config['SECRET_KEY'] = 'una_clave_muy_secreta_y_dificil' 

    # Config DB
    db_user = os.environ.get('MYSQL_USER', 'ecommerce_user')
    db_password = os.environ.get('MYSQL_PASSWORD', 'secret_password')
    db_host = os.environ.get('MYSQL_HOST', 'db')
    db_name = os.environ.get('MYSQL_DB', 'ecommerce_db')
    
    app.config['SQLALCHEMY_DATABASE_URI'] = f'mysql+mysqlconnector://{db_user}:{db_password}@{db_host}/{db_name}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    
    # Configuración de Login Manager
    login_manager.login_view = 'auth.login'
    login_manager.init_app(app)

    # Función para cargar el usuario
    from .models import User
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # --- REGISTRO DE BLUEPRINTS ---
    
    # 1. Shop (Tienda pública)
    from app.routes.shop import shop_bp
    app.register_blueprint(shop_bp, url_prefix='/')

    # 2. Auth (Login/Registro)
    from app.routes.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')

    # 3. Admin (Panel de Control) <--- LO MOVIMOS ACÁ, AFUERA DEL CONTEXTO
    from app.routes.admin import admin_bp
    app.register_blueprint(admin_bp, url_prefix='/admin')

    # --- SETUP FINAL ---

    # Context Processor (Para el carrito en el navbar)
    @app.context_processor
    def inject_cart_count():
        from flask import session
        cart = session.get('cart', {})
        count = sum(cart.values())
        return dict(cart_count=count)

    # Crear tablas si no existen
    with app.app_context():
        from . import models 
        db.create_all()

    return app