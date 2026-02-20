import os
from flask import Flask, session, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from config import Config  # <--- IMPORTANTE: Importamos tu nueva configuración

# Inicializamos las extensiones fuera de la función
db = SQLAlchemy()
login_manager = LoginManager()

def create_app():
    app = Flask(__name__)
    
    # PASO 1: Cargar la configuración general desde config.py
    # (Esto carga SECRET_KEY, MP_PUBLIC_KEY, MP_ACCESS_TOKEN, etc.)
    app.config.from_object(Config)

    # PASO 2: Lógica Inteligente de Base de Datos (Local vs Nube)
    # Verificamos si hay una URL de base de datos en las variables de entorno (Render)
    env_db_url = os.environ.get('SQLALCHEMY_DATABASE_URI') or os.environ.get('DATABASE_URL')

    if env_db_url:
        # ESTAMOS EN LA NUBE (Render)
        # Aplicamos el parche para PostgreSQL (Render usa 'postgres://' pero Python quiere 'postgresql://')
        if env_db_url.startswith("postgres://"):
            env_db_url = env_db_url.replace("postgres://", "postgresql://", 1)
        
        app.config['SQLALCHEMY_DATABASE_URI'] = env_db_url
    
    # Si no hay URL en el entorno, Flask usará la que definimos por defecto en config.py (Local MySQL)
    
    # PASO 3: Inicializar extensiones con la app configurada
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login' # A donde te manda si no estás logueado

    # Función para cargar el usuario (Flask-Login)
    from .models import User
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # PASO 4: Registro de Blueprints (Rutas)
    from app.routes.shop import shop_bp
    app.register_blueprint(shop_bp, url_prefix='/')

    from app.routes.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')

    from app.routes.admin import admin_bp
    app.register_blueprint(admin_bp, url_prefix='/admin')

    # PASO 5: Context Processor (Para que el carrito se vea en todas las páginas)
    @app.context_processor
    def inject_cart_count():
        cart = session.get('cart', {})
        count = sum(cart.values())
        return dict(cart_count=count)
    
    # Configuración global para usar variables en Templates (HTML)
    # Esto asegura que 'config' esté disponible en payment.html
    @app.context_processor
    def inject_config():
        return dict(config=app.config)

    # PASO 6: Crear tablas si no existen
    with app.app_context():
        # Importamos modelos para que SQLAlchemy los reconozca
        from . import models 
        db.create_all()

    # PASO 7: Error Handlers Globales (Blindaje)
    # El usuario NUNCA ve errores técnicos, siempre se redirige al landing
    import traceback

    @app.errorhandler(404)
    def not_found_error(error):
        flash('La página que buscás no existe.', 'warning')
        return redirect(url_for('shop.landing'))

    @app.errorhandler(403)
    def forbidden_error(error):
        flash('No tenés permiso para acceder a esta sección.', 'danger')
        return redirect(url_for('shop.landing'))

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()  # Rollback por si la BD quedó en mal estado
        flash('Ocurrió un error inesperado. Por favor intentá de nuevo.', 'danger')
        return redirect(url_for('shop.landing'))

    @app.errorhandler(Exception)
    def unhandled_exception(error):
        db.session.rollback()
        traceback.print_exc()  # Log en consola para debugging
        flash('Ocurrió un error inesperado. Por favor intentá de nuevo.', 'danger')
        return redirect(url_for('shop.landing'))

    return app