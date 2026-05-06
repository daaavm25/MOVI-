# ProyectoSW

Aplicacion web de peliculas con backend en Express, base de datos PostgreSQL y frontend estatico servido por el mismo servidor.

## Configuracion

1. Copia .env.example a .env.
2. Ajusta TMDB_API_KEY y las variables de base de datos.
3. Instala dependencias con npm install.
4. Inicia el servidor con npm start.

## Docker (demo y ejecucion)

### Verificar Docker

- Linux/macOS/WSL: docker --version
- Windows (PowerShell): docker --version

Si en Linux aparece permiso denegado con docker, usa sudo o reinicia sesion tras agregarte al grupo docker.

### Comandos de la practica (equivalentes a la pizarra)

- docker pull python:3.11.5-slim-bookworm
- docker run --rm python:3.11.5-slim-bookworm python3 --version
- docker image ls
- docker rmi python:3.11.5-slim-bookworm

Tambien puedes ejecutarlos con npm scripts:

- npm run docker:pull:python
- npm run docker:python:version
- npm run docker:image:list
- npm run docker:image:rm:python

### Ejecución Automática con Docker (Fase 3 y Fase 4)

TODO se ejecuta automáticamente. No necesitas comandos adicionales.

Paso único para levantar todo (backend + frontend + base de datos):

	docker compose up -d

Eso es todo. La aplicación estará lista en:
- Frontend: http://localhost:8080
- Backend: http://localhost:8000

PERSISTENCIA DE DATOS AUTOMÁTICA

Los datos de usuarios y cualquier información almacenada en PostgreSQL se guardan automáticamente en un volumen Docker llamado pgdata. Esto significa que aunque hagas docker compose down, los datos NO se pierden. Al volver a hacer docker compose up -d, todos tus usuarios y datos seguirán ahí.

Comandos útiles (opcionales):

- Ver logs: docker compose logs -f backend
- Parar servicios: docker compose down (datos persisten)
- Reiniciar: docker compose up -d
- Eliminar TODOS los datos (cuidado): docker compose down -v (el -v elimina volúmenes)

Nota de puertos:
- Frontend: 8080
- Backend: 8000
- PostgreSQL: 5433 en host (5432 interno)

COMO FUNCIONA

El archivo docker-compose.yml define 3 servicios:

1. db (PostgreSQL) - guarda todos los datos en el volumen pgdata
2. backend (Node/Express) - servicio API en puerto 8000
3. frontend (Nginx) - interfaz web en puerto 8080

Cuando haces docker compose up -d:
- Se construyen las imágenes (solo la primera vez)
- Se crean y levantan los contenedores
- Los servicios se conectan automáticamente entre sí
- Las tablas de base de datos se crean automáticamente
- El sistema está listo para usar

Cuando haces docker compose down:
- Se detienen y eliminan los contenedores
- Los volúmenes persisten (tus datos siguen guardados)
- Las imágenes se mantienen (más rápido al volver a levantar)

Cuando haces docker compose up -d de nuevo:
- Se reutilizan los contenedores
- Se cargan los datos del volumen pgdata
- Todo sigue funcionando como antes

## Variables importantes

- PORT: puerto del servidor.
- HOST: interfaz de red donde escucha el servidor.
- NODE_ENV: usa `production` para despliegue.
- FRONTEND_URL: origen permitido por CORS. Puedes poner varios separados por coma.
- TMDB_API_KEY: clave de The Movie Database.
- TMDB_BASE_URL: URL base de TMDB (opcional, por defecto oficial).
- TMDB_PROVIDER_COUNTRY: pais por defecto para consulta de proveedores.
- JACKETT_URL, JACKETT_API_KEY: configuracion del buscador de torrents.
- API_KEY_EXTERNA: llave opcional para integraciones o demos adicionales.
- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD: conexion a PostgreSQL.
- DATABASE_URL: alternativa de cadena unica para PostgreSQL.

En `NODE_ENV=production`, `FRONTEND_URL` es obligatorio para evitar CORS abierto.

## Reproduccion de peliculas

El proyecto hoy usa TMDB para catalogo, detalle y proveedores, pero TMDB no entrega video completo de peliculas para reproducirlo en un player propio. Para reproduccion legal en un reproductor nativo necesitas una API o catalogo con licencias de streaming y URLs directas de video o manifiestos HLS/DASH.

Con el estado actual, la opcion correcta es:

- usar TMDB para descubrimiento y detalle;
- usar proveedores para redirigir al usuario a la plataforma oficial donde puede verla;
- integrar un proveedor licenciado si quieren reproduccion dentro de la pagina.