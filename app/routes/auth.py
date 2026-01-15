from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from app.models import User
from app import db

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('shop.index'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')

        # Verificamos si existe
        user_exists = User.query.filter_by(email=email).first()
        if user_exists:
            flash('El email ya está registrado.', 'danger')
            return redirect(url_for('auth.register'))

        # Creamos usuario nuevo
        new_user = User(username=username, email=email)
        new_user.set_password(password) # Encriptamos
        
        db.session.add(new_user)
        db.session.commit()
        
        flash('¡Cuenta creada! Ahora podés ingresar.', 'success')
        return redirect(url_for('auth.login'))

    return render_template('auth/register.html')

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('shop.index'))

    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        
        user = User.query.filter_by(email=email).first()
        
        # Verificamos pass
        if user and user.check_password(password):
            login_user(user)
            flash('¡Bienvenido de nuevo!', 'success')
            # Si intentó entrar a una pagina protegida, lo mandamos ahí, sino al home
            next_page = request.args.get('next')
            return redirect(next_page or url_for('shop.index'))
        else:
            flash('Email o contraseña incorrectos.', 'danger')
    
    return render_template('auth/login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Cerraste sesión correctamente.', 'info')
    return redirect(url_for('shop.index'))