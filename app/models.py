from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from . import db
from datetime import datetime

# Tabla de Usuarios (Admin y Clientes)
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    
    # Métodos para manejar el password seguro
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<User {self.username}>'

# Tabla de Productos
class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Float, nullable=False)
    stock = db.Column(db.Integer, default=0)
    image_url = db.Column(db.String(200), nullable=True) # Guardaremos la URL, no la foto en sí en la DB
    
    def __repr__(self):
        return f'<Product {self.name}>'

# Tabla de Pedidos (Cabecera)
# ... (User y Product quedan igual)

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    # Relación con el usuario (clave foránea)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False) # <--- AGREGADO
    customer_name = db.Column(db.String(100), nullable=False)
    customer_email = db.Column(db.String(120), nullable=False)
    total_price = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), default='pending') # pending, paid, shipped
    date_created = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relación para acceder a los items de la orden
    items = db.relationship('OrderItem', backref='order', lazy=True)

    # Relación con usuario
    user = db.relationship('User', backref='orders') 

    def __repr__(self):
        return f'<Order {self.id} - {self.status}>'

# --- NUEVA TABLA ---
class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    product_name = db.Column(db.String(100), nullable=False) # Guardamos el nombre por si después cambia
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False) # Guardamos el precio AL MOMENTO de la compra

    def __repr__(self):
        return f'<OrderItem {self.product_name} x {self.quantity}>'