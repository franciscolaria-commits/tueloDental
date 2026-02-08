import os
from flask import Blueprint, render_template, redirect, url_for, flash, session, request, current_app
from flask_login import current_user, login_required
from app.models import Product, Order, OrderItem
from app import db
import mercadopago

shop_bp = Blueprint('shop', __name__)

# --- CONFIGURACIÓN SDK MERCADOPAGO ---
def get_mp_sdk():
    access_token = current_app.config['MP_ACCESS_TOKEN']
    if not access_token:
        print("⚠️ ADVERTENCIA: No hay MP_ACCESS_TOKEN configurado.")
        return None
    return mercadopago.SDK(access_token)

# --- RUTAS DE NAVEGACIÓN ---

@shop_bp.route('/')
def landing():
    return render_template('shop/landing.html')

@shop_bp.route('/catalogo')
def index():
    categories_query = db.session.query(Product.category).distinct().all()
    categories = [c[0] for c in categories_query if c[0]]

    query = Product.query
    category_filter = request.args.get('category')
    if category_filter:
        query = query.filter_by(category=category_filter)

    search_query = request.args.get('q')
    if search_query:
        query = query.filter(Product.name.ilike(f'%{search_query}%'))

    products = query.all()

    return render_template(
        'shop/index.html', 
        products=products, 
        categories=categories, 
        current_category=category_filter
    )

# @shop_bp.route('/product/<int:product_id>')
# def product_detail(product_id):
#     product = Product.query.get_or_404(product_id)
#     return render_template('shop/detail.html', product=product)

# --- CARRITO DE COMPRAS ---

@shop_bp.route('/cart/add/<int:product_id>')
def add_to_cart(product_id):
    product = Product.query.get_or_404(product_id)
    
    if product.stock <= 0:
        flash('¡Ups! Producto sin stock.', 'danger')
        return redirect(request.referrer or url_for('shop.index'))

    cart = session.get('cart', {})
    str_id = str(product_id)
    current_qty = cart.get(str_id, 0)
    
    if current_qty + 1 > product.stock:
        flash(f'No podés agregar más. Solo quedan {product.stock} unidades.', 'warning')
    else:
        if str_id in cart:
            cart[str_id] += 1
        else:
            cart[str_id] = 1
        
        session['cart'] = cart
        flash(f'Agregaste {product.name} al carrito.', 'success')
    
    return redirect(request.referrer or url_for('shop.index'))

@shop_bp.route('/cart')
def view_cart():
    cart = session.get('cart', {})
    if not cart:
        return render_template('shop/cart.html', products=[], total=0, quantities={})
    
    products = Product.query.filter(Product.id.in_(cart.keys())).all()
    total = 0
    for product in products:
        qty = cart[str(product.id)]
        total += product.price * qty
    
    return render_template('shop/cart.html', products=products, total=total, quantities=cart)

@shop_bp.route('/cart/update/<int:product_id>/<string:action>')
def update_quantity(product_id, action):
    cart = session.get('cart', {})
    str_id = str(product_id)
    
    if str_id in cart:
        product = Product.query.get(product_id)
        if action == 'increase':
            if product and cart[str_id] < product.stock:
                cart[str_id] += 1
            else:
                flash(f'¡No hay más stock disponible de {product.name}!', 'warning')
        elif action == 'decrease':
            if cart[str_id] > 1:
                cart[str_id] -= 1
        session['cart'] = cart
        
    return redirect(url_for('shop.view_cart'))

@shop_bp.route('/cart/remove/<int:product_id>')
def remove_from_cart(product_id):
    cart = session.get('cart', {})
    str_id = str(product_id)
    if str_id in cart:
        del cart[str_id]
        session['cart'] = cart
        flash('Producto eliminado.', 'info')
    return redirect(url_for('shop.view_cart'))

# --- PROCESO DE PAGO (CHECKOUT) ---

# --- EN app/routes/shop.py ---

@shop_bp.route('/checkout', methods=['GET', 'POST'])
@login_required
def checkout():
    cart = session.get('cart', {})
    if not cart:
        flash('El carrito está vacío', 'warning')
        return redirect(url_for('shop.index'))
    
    products = Product.query.filter(Product.id.in_(cart.keys())).all()
    
    # Calculamos el total para mostrarlo en la pantalla de selección
    total_price = 0
    for product in products:
        quantity = cart[str(product.id)]
        if product.stock < quantity:
            flash(f'¡Ups! No hay suficiente stock de {product.name}.', 'danger')
            return redirect(url_for('shop.view_cart'))
        total_price += product.price * quantity

    # [NUEVO] Si entra por GET, le mostramos las opciones de pago
    if request.method == 'GET':
        return render_template('shop/checkout_options.html', total=total_price)

    # [NUEVO] Si entra por POST, es que ya eligió
    payment_method = request.form.get('payment_method') # 'mp' o 'local'

    # CREAR ORDEN (PENDIENTE)
    items_mp = []
    
    order = Order(
        user_id=current_user.id,
        total_price=0,
        status='pending' 
    )
    db.session.add(order)
    db.session.flush() 
    
    for product in products:
        quantity = cart[str(product.id)]
        
        # RESTAR STOCK (RESERVA)
        product.stock -= quantity 

        order_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=quantity,
            price_at_purchase=product.price
        )
        db.session.add(order_item)
        
        items_mp.append({
            "title": product.name,
            "quantity": quantity,
            "currency_id": "ARS",
            "unit_price": float(product.price)
        })

    order.total_price = total_price
    db.session.commit()
    
    # Vaciamos carrito
    session.pop('cart', None)

    # --- DECISIÓN DE CAMINO ---
    
    if payment_method == 'local':
        # CAMINO A: PAGO EN LOCAL -> Va directo al éxito (estado pendiente)
        flash('¡Reserva exitosa! Te esperamos en el local.', 'success')
        return redirect(url_for('shop.payment_success', order_id=order.id))

    else:
        # CAMINO B: MERCADOPAGO -> Va a la pasarela
        sdk = get_mp_sdk()
        if not sdk:
            flash('Error de configuración de MP', 'danger')
            return redirect(url_for('shop.my_orders'))

        base_url = current_app.config['BASE_URL'] 

        preference_data = {
            "items": items_mp,
            "payer": {"name": current_user.username, "email": current_user.email},
            "back_urls": {
                "success": f"{base_url}/payment/success",
                "failure": f"{base_url}/payment/failure",
                "pending": f"{base_url}/payment/pending"
            },
            "auto_return": "approved", 
            "external_reference": str(order.id)
        }

        try:
            preference_response = sdk.preference().create(preference_data)
            preference = preference_response["response"]
            
            return render_template('shop/payment.html', preference_id=preference['id'], order=order)
            
        except Exception as e:
            flash('Error al conectar con MercadoPago', 'danger')
            return redirect(url_for('shop.my_orders'))


@shop_bp.route('/payment/success')
def payment_success():
    # Esta ruta maneja dos llegadas:
    # 1. Desde MercadoPago (trae ?collection_status=approved&external_reference=ID)
    # 2. Desde Pago Local (trae ?order_id=ID)

    # Datos de MP
    status = request.args.get('collection_status')
    external_ref = request.args.get('external_reference')
    
    # Datos Locales
    local_order_id = request.args.get('order_id')
    
    order = None

    if status == 'approved' and external_ref:
        order = Order.query.get(external_ref)
        if order and order.status != 'paid':
            order.status = 'paid'
            db.session.commit()
            flash('¡Pago acreditado!', 'success')
            
    elif local_order_id:
        order = Order.query.get(local_order_id)
        # No cambiamos a 'paid', sigue 'pending'
    
    if not order:
        return redirect(url_for('shop.my_orders'))

    return render_template('shop/success.html', order=order)
@shop_bp.route('/payment/failure')
def payment_failure():
    # Si falla, podríamos querer devolver el stock, pero por ahora avisamos
    flash('El pago fue rechazado o cancelado. Por favor intentá de nuevo.', 'danger')
    return redirect(url_for('shop.index'))

@shop_bp.route('/payment/pending')
def payment_pending():
    flash('El pago está pendiente. Te avisaremos cuando se acredite.', 'warning')
    return redirect(url_for('shop.my_orders'))

@shop_bp.route('/my-orders')
@login_required
def my_orders():
    orders = Order.query.filter_by(user_id=current_user.id).order_by(Order.date_created.desc()).all()
    return render_template('shop/my_orders.html', orders=orders)