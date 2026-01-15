# # 1. Usamos una imagen base oficial de Python (versión 3.10 slim para que pese poco)
# FROM python:3.10-slim

# # 2. Evita que Python genere archivos .pyc y permite ver los logs en tiempo real
# ENV PYTHONDONTWRITEBYTECODE=1
# ENV PYTHONUNBUFFERED=1

# # 3. Establecemos el directorio de trabajo dentro del contenedor
# WORKDIR /app

# # 4. Instalamos dependencias del sistema necesarias
# # (gcc y default-libmysqlclient-dev son necesarios si usas ciertos drivers de MySQL, 
# # es mejor tenerlos por si acaso para no renegar después)
# RUN apt-get update \
#     && apt-get install -y --no-install-recommends gcc default-libmysqlclient-dev pkg-config \
#     && rm -rf /var/lib/apt/lists/*

# # 5. Copiamos PRIMERO el archivo de requerimientos
# COPY requirements.txt .

# # 6. Instalamos las librerías de Python
# RUN pip install --upgrade pip
# RUN pip install --no-cache-dir -r requirements.txt

# # 7. Copiamos el resto del código de tu proyecto al contenedor
# COPY . .


# # Copiamos el script de entrada
# COPY entrypoint.sh .
# # Le damos permisos de ejecución
# RUN chmod +x entrypoint.sh

# # Exponemos el puerto que usa Render (suele ser 10000 opcionalmente)
# EXPOSE 10000

# # Comando final
# CMD ["./entrypoint.sh"]
# # # 8. Exponemos el puerto 5000 (el default de Flask)
# # EXPOSE 5000

# # # 9. Comando para iniciar la aplicación (asumiendo que tu archivo principal se llame run.py o app.py)
# # # Usamos "python -m flask run" para desarrollo, configurando el host en 0.0.0.0 para que sea accesible desde fuera
# # CMD ["python", "run.py"]
# 1. Imagen base
FROM python:3.10-slim

# 2. Variables de entorno
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 3. Directorio de trabajo
WORKDIR /app

# 4. Dependencias del sistema (Incluimos libpq-dev para Postgres)
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc default-libmysqlclient-dev pkg-config libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 5. Dependencias Python
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copiamos el código
COPY . .

# 7. Puerto (Render usa el 10000)
EXPOSE 10000

# 8. COMANDO DE ARRANQUE DIRECTO (Sin entrypoint.sh)
# Usamos Gunicorn, bindeamos al puerto 10000 y ejecutamos la app
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "run:app"]