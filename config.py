import os

class Config:
    # Clave de seguridad de Flask (para sesiones y cookies)
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'clave-secreta-dev-123'
    
    # Base de Datos
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'mysql+pymysql://ecommerce_user:secret_password@db/ecommerce_db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # MERCADOPAGO (Acá está la magia para que llegue al HTML)
    MP_PUBLIC_KEY = os.environ.get('MP_PUBLIC_KEY')
    MP_ACCESS_TOKEN = os.environ.get('MP_ACCESS_TOKEN')
    
    # URL Base (para los retornos de pago)
    BASE_URL = os.environ.get('BASE_URL') or 'http://127.0.0.1:5000'