import io
from datetime import datetime
from functools import wraps
import pandas as pd
from werkzeug.utils import secure_filename

from flask import Blueprint, render_template, request, redirect, url_for, flash, abort, send_file
from flask_login import login_required, current_user
from app.models import Product, Order
from app import db

admin_bp = Blueprint('admin', __name__)

# --- DECORADOR PERSONALIZADO ---
def admin_required(f):
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if not current_user.is_admin:
            abort(403)
        return f(*args, **kwargs)
    return decorated_function

# --- RUTAS DE DASHBOARD Y PRODUCTOS ---

@admin_bp.route('/')
@admin_required
def dashboard():
    products = Product.query.all()
    return render_template('admin/dashboard.html', products=products)

@admin_bp.route('/product/new', methods=['GET', 'POST'])
@admin_required
def create_product():
    if request.method == 'POST':
        name = request.form.get('name')
        price = float(request.form.get('price'))
        stock = int(request.form.get('stock'))
        description = request.form.get('description')
        image_url = request.form.get('image_url')
        
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

@admin_bp.route('/import/products', methods=['POST'])
@admin_required
def import_products():
    if 'file' not in request.files:
        flash('No se seleccionó ningún archivo', 'danger')
        return redirect(url_for('admin.dashboard'))
    
    file = request.files['file']
    
    if file.filename == '':
        flash('Nombre de archivo vacío', 'danger')
        return redirect(url_for('admin.dashboard'))

    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.csv')):
        flash('Solo se permiten archivos Excel (.xlsx) o CSV', 'danger')
        return redirect(url_for('admin.dashboard'))

    try:
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(file)
        else:
            df = pd.read_csv(file)
        
        # Limpiamos espacios en los nombres de las columnas por si acaso " Nombre "
        df.columns = [c.strip() for c in df.columns]

        count_new = 0
        count_updated = 0
        
        for index, row in df.iterrows():
            # --- LECTURA FLEXIBLE (Mayúscula o Minúscula) ---
            
            # 1. NOMBRE (Nombre o nombre)
            raw_name = row.get('Nombre', row.get('nombre'))
            if not raw_name or pd.isna(raw_name):
                continue # Si no tiene nombre, saltamos esta fila
            name = str(raw_name).strip()

            # 2. PRECIO (Precio o precio)
            raw_price = row.get('Precio', row.get('precio'))
            price = float(raw_price) if raw_price and pd.notna(raw_price) else 0.0

            # 3. STOCK (Stock o stock)
            raw_stock = row.get('Stock', row.get('stock'))
            stock = int(raw_stock) if raw_stock and pd.notna(raw_stock) else 0

            # 4. DESCRIPCIÓN (Descripcion, descripcion o Descripción)
            raw_desc = row.get('Descripcion', row.get('descripcion', row.get('Descripción')))
            description = str(raw_desc) if raw_desc and pd.notna(raw_desc) else ''
            
            # 5. CATEGORÍA (Categoria, categoria o Categoría)
            raw_cat = row.get('Categoria', row.get('categoria', row.get('Categoría')))
            if raw_cat and pd.notna(raw_cat):
                category = str(raw_cat).strip()
            else:
                category = "General"

            # ------------------------------------------------

            product = Product.query.filter_by(name=name).first()
            
            if product:
                # ACTUALIZAR
                product.price = price
                product.stock = stock
                product.description = description
                product.category = category
                count_updated += 1
            else:
                # CREAR
                new_product = Product(
                    name=name,
                    price=price,
                    stock=stock,
                    description=description,
                    category=category,
                    image_url="" 
                )
                db.session.add(new_product)
                count_new += 1
        
        db.session.commit()
        flash(f'Proceso terminado: {count_new} nuevos, {count_updated} actualizados.', 'success')

    except Exception as e:
        flash(f'Error al procesar el archivo: {str(e)}', 'danger')
        print(f"Error importando: {e}")

    return redirect(url_for('admin.dashboard'))
    
# --- RUTAS DE GESTIÓN DE ÓRDENES (Lógica Nueva) ---

@admin_bp.route('/orders')
@admin_required
def orders():
    # 1. Órdenes Activas: Pendientes o Pagadas (Las que requieren acción)
    active_orders = Order.query.filter(Order.status.in_(['pending', 'paid']))\
                               .order_by(Order.date_created.desc()).all()
    
    # 2. Historial: Solo las Enviadas/Entregadas
    history_orders = Order.query.filter_by(status='shipped')\
                                .order_by(Order.date_created.desc()).all()
    
    return render_template('admin/orders.html', active_orders=active_orders, history_orders=history_orders)

@admin_bp.route('/order/status/<int:order_id>/<string:new_status>')
@admin_required
def update_order_status(order_id, new_status):
    order = Order.query.get_or_404(order_id)
    
    allowed_statuses = ['paid', 'shipped', 'cancelled']
    
    if new_status not in allowed_statuses:
        flash('Estado no válido.', 'danger')
        return redirect(url_for('admin.orders'))
    
    # Si cancelamos la orden, devolvemos el stock
    if new_status == 'cancelled' and order.status != 'cancelled':
        for item in order.items:
            if item.product: # Verificamos que el producto aún exista en DB
                item.product.stock += item.quantity
        flash('Orden cancelada y stock restaurado.', 'info')
    
    # Mensaje de éxito si se envía al historial
    if new_status == 'shipped':
        flash(f'¡Orden #{order.id} archivada en el Historial!', 'success')
    else:
        flash(f'Estado actualizado a: {new_status}', 'success')

    order.status = new_status
    db.session.commit()
    
    return redirect(url_for('admin.orders'))

@admin_bp.route('/orders/export_clean')
@admin_required
def export_and_clean_history():
    # 1. Buscamos SOLO las órdenes del historial (ya enviadas)
    orders_to_export = Order.query.filter_by(status='shipped').all()
    
    if not orders_to_export:
        flash('No hay órdenes terminadas para exportar.', 'warning')
        return redirect(url_for('admin.orders'))

    # 2. Convertimos los datos a formato Pandas (Excel)
    data = []
    for order in orders_to_export:
        # Aplanamos los items
        items_str = ", ".join([f"{i.quantity}x {i.product.name if i.product else 'Eliminado'}" for i in order.items])
        
        data.append({
            'ID Orden': order.id,
            'Fecha': order.date_created.strftime('%Y-%m-%d %H:%M'),
            'Cliente': order.user.username,
            'Email': order.user.email,
            'Total ($)': order.total_price,
            'Productos': items_str,
            'Estado': 'Entregado'
        })
    
    df = pd.DataFrame(data)

    # 3. Guardamos en Memoria
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Ventas Terminadas')
    output.seek(0)

    # 4. LIMPIEZA DE BASE DE DATOS
    try:
        for order in orders_to_export:
            # Primero borramos los items de la orden
            for item in order.items:
                db.session.delete(item)
            # Después borramos la orden
            db.session.delete(order)
        db.session.commit()
        print("🧹 Historial limpiado exitosamente.")
    except Exception as e:
        db.session.rollback()
        flash(f'Error al limpiar base de datos: {str(e)}', 'danger')
        return redirect(url_for('admin.orders'))

    # 5. Descargar archivo
    filename = f"Ventas_Terminadas_{datetime.now().strftime('%Y_%m_%d')}.xlsx"
    return send_file(output, download_name=filename, as_attachment=True, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

