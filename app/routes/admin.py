from flask import Blueprint, render_template, request, redirect, url_for, flash, abort
from flask_login import login_required, current_user
from app.models import Product, Order
from app import db
from functools import wraps

admin_bp = Blueprint('admin', __name__)

# --- DECORADOR PERSONALIZADO ---
# Esto funciona como un patovica: si no sos admin, te rebota
def admin_required(f):
    @wraps(f)
    @login_required # Primero tiene que estar logueado
    def decorated_function(*args, **kwargs):
        if not current_user.is_admin:
            abort(403) # Error 403: Prohibido
        return f(*args, **kwargs)
    return decorated_function

# --- RUTAS ---

@admin_bp.route('/')
@admin_required
def dashboard():
    products = Product.query.all()
    return render_template('admin/dashboard.html', products=products)

@admin_bp.route('/product/new', methods=['GET', 'POST'])
@admin_required
def new_product():
    if request.method == 'POST':
        name = request.form.get('name')
        price = float(request.form.get('price'))
        stock = int(request.form.get('stock'))
        description = request.form.get('description')
        image_url = request.form.get('image_url') # Por ahora URL manual, después vemos subida de archivos
        
        product = Product(name=name, price=price, stock=stock, description=description, image_url=image_url)
        db.session.add(product)
        db.session.commit()
        flash('Producto creado exitosamente.', 'success')
        return redirect(url_for('admin.dashboard'))
        
    return render_template('admin/product_form.html', action='Crear')

@admin_bp.route('/product/edit/<int:id>', methods=['GET', 'POST'])
@admin_required
def edit_product(id):
    product = Product.query.get_or_404(id)
    
    if request.method == 'POST':
        product.name = request.form.get('name')
        product.price = float(request.form.get('price'))
        product.stock = int(request.form.get('stock'))
        product.description = request.form.get('description')
        product.image_url = request.form.get('image_url')
        
        db.session.commit()
        flash('Producto actualizado.', 'success')
        return redirect(url_for('admin.dashboard'))
        
    return render_template('admin/product_form.html', product=product, action='Editar')

@admin_bp.route('/product/delete/<int:id>')
@admin_required
def delete_product(id):
    product = Product.query.get_or_404(id)
    db.session.delete(product)
    db.session.commit()
    flash('Producto eliminado.', 'info')
    return redirect(url_for('admin.dashboard'))
@admin_bp.route('/orders')
@admin_required
def orders():
    # Traemos todas las ordenes, las más nuevas primero
    orders = Order.query.order_by(Order.date_created.desc()).all()
    return render_template('admin/orders.html', orders=orders)
@admin_bp.route('/order/status/<int:order_id>/<string:new_status>')
@admin_required
def update_order_status(order_id, new_status):
    order = Order.query.get_or_404(order_id)
    
    # Validamos que el estado sea uno de los permitidos
    allowed_statuses = ['pending', 'paid', 'shipped', 'cancelled']
    if new_status not in allowed_statuses:
        flash('Estado no válido.', 'danger')
        return redirect(url_for('admin.orders'))
    
    # Si cancelamos la orden, deberíamos devolver el stock (Opcional, lógica avanzada)
    if new_status == 'cancelled' and order.status != 'cancelled':
        for item in order.items:
            product = Product.query.get(item.product_id)
            if product:
                product.stock += item.quantity
        flash('Orden cancelada y stock restaurado.', 'info')
    else:
        flash(f'Estado actualizado a: {new_status}', 'success')

    order.status = new_status
    db.session.commit()
    
    return redirect(url_for('admin.orders'))