#!/bin/sh
# Crear las tablas de la base de datos (por si no existen)
python -c "from app import create_app, db; app = create_app(); app.app_context().push(); db.create_all()"

# Iniciar la app usando Gunicorn (Servidor pro)
exec gunicorn --bind 0.0.0.0:10000 run:app