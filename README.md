# ProyectoSW

Aplicacion web de peliculas con backend en Express, base de datos PostgreSQL y frontend estatico servido por el mismo servidor.

## Configuracion

1. Copia .env.example a .env.
2. Ajusta TMDB_API_KEY y las variables de base de datos.
3. Instala dependencias con npm install.
4. Inicia el servidor con npm start.

## Variables importantes

- PORT: puerto del servidor.
- FRONTEND_URL: origen permitido por CORS. Puedes poner varios separados por coma.
- TMDB_API_KEY: clave de The Movie Database.
- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD: conexion a PostgreSQL.
- DATABASE_URL: alternativa de cadena unica para PostgreSQL.

## Reproduccion de peliculas

El proyecto hoy usa TMDB para catalogo, detalle y proveedores, pero TMDB no entrega video completo de peliculas para reproducirlo en un player propio. Para reproduccion legal en un reproductor nativo necesitas una API o catalogo con licencias de streaming y URLs directas de video o manifiestos HLS/DASH.

Con el estado actual, la opcion correcta es:

- usar TMDB para descubrimiento y detalle;
- usar proveedores para redirigir al usuario a la plataforma oficial donde puede verla;
- integrar un proveedor licenciado si quieren reproduccion dentro de la pagina.