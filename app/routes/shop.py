from flask import Blueprint, render_template, session, redirect, url_for, flash, request
from app.models import Product, Order, OrderItem
from flask_login import current_user, login_required, logout_user
from app import db
import mercadopago 
import os

shop_bp = Blueprint('shop', __name__)
sdk = mercadopago.SDK(os.environ.get("MP_ACCESS_TOKEN"))
# --- RUTAS PÚBLICAS ---

@shop_bp.route('/')
def index():
    products = Product.query.all()
    return render_template('shop/index.html', products=products)

@shop_bp.route('/product/<int:product_id>')
def product_detail(product_id):
    product = Product.query.get_or_404(product_id)
    return render_template('shop/detail.html', product=product)

# --- RUTAS DEL CARRITO ---

@shop_bp.route('/cart/add/<int:product_id>')
def add_to_cart(product_id):
    # 1. Buscamos el producto en la DB para saber cuánto stock real hay
    product = Product.query.get_or_404(product_id)
    
    if 'cart' not in session:
        session['cart'] = {}
    
    cart = session['cart']
    product_id_str = str(product_id)

    # 2. Vemos cuánto tiene ya en el carrito (si no tiene nada, es 0)
    current_quantity_in_cart = cart.get(product_id_str, 0)

    # 3. EL CHECKEO DE STOCK (La parte nueva)
    # Si lo que quiere agregar supera lo que hay...
    if current_quantity_in_cart + 1 > product.stock:
        flash(f'¡No hay suficiente stock! Solo quedan {product.stock} unidades.', 'danger')
        # Lo mandamos de vuelta sin sumar nada
        return redirect(request.referrer or url_for('shop.index'))

    # Si hay stock, procedemos normal
    if product_id_str in cart:
        cart[product_id_str] += 1
    else:
        cart[product_id_str] = 1
    
    session['cart'] = cart
    session.modified = True
    
    flash('Producto agregado al carrito', 'success')
    return redirect(request.referrer or url_for('shop.index'))

@shop_bp.route('/cart')
def view_cart():
    cart = session.get('cart', {})
    cart_items = []
    total_price = 0
    
    # Buscamos los productos reales en la DB basados en los IDs de la sesión
    for p_id, quantity in cart.items():
        product = Product.query.get(int(p_id))
        if product:
            subtotal = product.price * quantity
            total_price += subtotal
            cart_items.append({
                'product': product,
                'quantity': quantity,
                'subtotal': subtotal
            })
            
    return render_template('shop/cart.html', cart_items=cart_items, total_price=total_price)

@shop_bp.route('/cart/remove/<int:product_id>')
def remove_from_cart(product_id):
    cart = session.get('cart', {})
    product_id_str = str(product_id)
    
    if product_id_str in cart:
        del cart[product_id_str]
        session['cart'] = cart
        session.modified = True
        flash('Producto eliminado.', 'info')
        
    return redirect(url_for('shop.view_cart'))

@shop_bp.route('/cart/clear')
def clear_cart():
    session.pop('cart', None)
    flash('Carrito vaciado.', 'info')
    return redirect(url_for('shop.index'))

@shop_bp.route('/checkout', methods=['GET', 'POST'])
@login_required
def checkout():
    # ... (Parte 1: Validaciones y armado de items igual que antes) ...
    cart = session.get('cart', {})
    if not cart:
        flash('El carrito está vacío.', 'warning')
        return redirect(url_for('shop.index'))
    
    total_price = 0
    items_mp = [] 
    items_db = [] 

    for p_id, quantity in cart.items():
        product = Product.query.get(p_id)
        if not product or product.stock < quantity:
            flash(f'Sin stock: {product.name}.', 'danger')
            return redirect(url_for('shop.view_cart'))
        
        subtotal = product.price * quantity
        total_price += subtotal
        items_db.append((product, quantity))
        items_mp.append({
            "id": str(product.id),
            "title": product.name,
            "quantity": int(quantity),
            "unit_price": float(product.price),
            "currency_id": "ARS" 
        })

    if request.method == 'POST':
        # A. Crear orden en DB
        order = Order(
            user_id=current_user.id,
            customer_name=current_user.username,
            customer_email=current_user.email,
            total_price=total_price,
            status='pending'
        )
        db.session.add(order)
        db.session.flush()

        for product, quantity in items_db:
            order_item = OrderItem(
                order_id=order.id,
                product_id=product.id,
                product_name=product.name,
                price=product.price,
                quantity=quantity
            )
            product.stock -= quantity
            db.session.add(order_item)

        db.session.commit()
        
        # --- OJO: ACÁ BORRAMOS LA LÍNEA QUE BORRABA EL CARRITO ---
        # session.pop('cart', None) <--- ESTO LO MOVEMOS MÁS ABAJO
        # ---------------------------------------------------------

        # B. MercadoPago
        preference_data = {
            "items": items_mp,
            "payer": {
                "name": current_user.username,
                "email": current_user.email
            },
            "back_urls": {
                "success": "http://127.0.0.1:5000/payment/success",
                "failure": "http://127.0.0.1:5000/payment/failure",
                "pending": "http://127.0.0.1:5000/payment/pending"
            },
            # "auto_return": "approved", 
            "external_reference": str(order.id)
        }

        try:
            preference_response = sdk.preference().create(preference_data)
            preference = preference_response.get("response", {})

            if "id" not in preference:
                print("\n\n" + "="*50)
                print("❌ ERROR DE MERCADOPAGO DETECTADO:")
                print(preference_response) 
                print("="*50 + "\n\n")
                
                # Rollback de stock porque falló
                for product, quantity in items_db:
                    product.stock += quantity
                db.session.commit()

                flash('Hubo un error al conectar con MercadoPago. Revisá la terminal.', 'danger')
                return redirect(url_for('shop.view_cart'))
            
            # --- SI LLEGAMOS ACÁ, EL PAGO SE GENERÓ BIEN ---
            # AHORA SÍ BORRAMOS EL CARRITO
            session.pop('cart', None)
            # -----------------------------------------------

            return render_template('shop/payment.html', preference_id=preference["id"], order=order)

        except Exception as e:
            print(f"ERROR CRÍTICO MP: {e}")
            flash('Error de conexión interno.', 'danger')
            return redirect(url_for('shop.view_cart'))

    return render_template('shop/checkout.html', total_price=total_price)
# --- RUTAS DE RETORNO (Back URLs) ---

@shop_bp.route('/payment/success')
def payment_success():
    # MP nos manda datos en la URL
    payment_id = request.args.get('payment_id')
    status = request.args.get('status')
    order_id = request.args.get('external_reference') # Recuperamos el ID de orden
    
    if order_id:
        order = Order.query.get(order_id)
        if order:
            order.status = 'paid' # ¡Confirmamos el pago!
            db.session.commit()
            flash(f'¡Pago Aprobado! ID: {payment_id}', 'success')
            
    return redirect(url_for('shop.my_orders'))

@shop_bp.route('/payment/failure')
def payment_failure():
    flash('El pago fue rechazado o cancelado.', 'danger')
    return redirect(url_for('shop.index'))

@shop_bp.route('/payment/pending')
def payment_pending():
    flash('El pago está pendiente de aprobación.', 'warning')
    return redirect(url_for('shop.my_orders'))

@shop_bp.route('/my-orders')
@login_required
def my_orders():
    # Mostramos las órdenes del usuario logueado
    orders = Order.query.filter_by(user_id=current_user.id).order_by(Order.date_created.desc()).all()
    return render_template('shop/my_orders.html', orders=orders)