import os

class Config:
    # Clave de seguridad (En Render la agregás en Environment, acá usa la default)
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'clave-secreta-dev-123'
    
    # --- BASE DE DATOS (FIX PARA RENDER) ---
    # Recuperamos la URL
    database_url = os.environ.get('DATABASE_URL')
    
    # Si existe y empieza con "postgres://", lo corregimos a "postgresql://"
    if database_url and database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    
    # Si no hay variable (estamos en local sin .env), usamos la de Docker/Local
    SQLALCHEMY_DATABASE_URI = database_url or 'mysql+pymysql://ecommerce_user:secret_password@db/ecommerce_db'
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # --- MERCADOPAGO ---
    # Lee las variables seguras que configuraste
    MP_PUBLIC_KEY = os.environ.get('MP_PUBLIC_KEY')
    MP_ACCESS_TOKEN = os.environ.get('MP_ACCESS_TOKEN')
    
    # URL Base
    BASE_URL = os.environ.get('BASE_URL') or 'http://127.0.0.1:5000'