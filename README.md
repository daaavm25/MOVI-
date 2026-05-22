# MOVI-

Plataforma web de películas con catálogo, watchlist personal, búsqueda de torrents y reproductor de streaming integrado.

**🌐 Producción:** https://movi-app.northcentralus.cloudapp.azure.com  
**📖 API Docs (Swagger):** https://movi-app.northcentralus.cloudapp.azure.com/docs/

---

## ¿Qué es MOVI-?

MOVI- es una aplicación web full-stack que permite explorar el catálogo de películas de TMDB, guardar una watchlist personal y reproducir películas en streaming directamente desde torrents, sin instalación de software adicional en el cliente.

El diferenciador principal es el **reproductor de streaming por torrent integrado**: el servidor descarga el torrent en tiempo real y lo transmite al navegador del usuario usando tecnología P2P, con conversión de audio automática para máxima compatibilidad y un modo de ahorro de datos para conexiones lentas o móviles.

---

## Stack tecnológico

| Capa | Tecnología | Rol |
|------|-----------|-----|
| Frontend | HTML5 · CSS3 · JavaScript Vanilla | Interfaz de usuario, sin frameworks |
| Backend | Node.js 20 · Express 5 | API REST, sirve el frontend como estáticos |
| Base de datos | PostgreSQL 16 · Sequelize ORM | Usuarios, sesiones, watchlist |
| Streaming P2P | WebTorrent 2.x | Descarga y stream de torrents en el servidor |
| Transcodificación | FFmpeg 5.1 | Convierte audio AC3/DTS → AAC en tiempo real |
| Proxy inverso | nginx 1.27 | HTTPS, TLS, headers de seguridad, balanceo |
| Contenedores | Docker · Docker Compose v2 | Orquestación de servicios |
| Indexador torrents | Jackett + TPB + YTS | Búsqueda multi-proveedor |
| Catálogo películas | TMDB API | Metadatos, pósters, géneros, proveedores |
| Infraestructura | Azure VM Standard_D2s_v3 · Ubuntu | Servidor en la nube |
| TLS/HTTPS | Let's Encrypt (Certbot) | Certificado SSL gratuito, auto-renovable |
| Documentación API | Swagger / OpenAPI 3 | Explorador interactivo de endpoints |

---

## Arquitectura del sistema

```
                        INTERNET
                           │
                    ┌──────▼──────┐
                    │   Usuario   │
                    │  Navegador  │
                    └──────┬──────┘
                           │ HTTPS :443
                           │ HTTP  :80 (→ redirect HTTPS)
                    ┌──────▼──────────────────────────────────┐
                    │            Azure VM                      │
                    │                                          │
                    │  ┌─────────────────────────────────┐    │
                    │  │        nginx (reverse proxy)     │    │
                    │  │  TLS · HSTS · Security Headers  │    │
                    │  └────────────────┬────────────────┘    │
                    │                   │ HTTP interno         │
                    │  ┌────────────────▼────────────────┐    │
                    │  │      Backend (Express :8000)     │    │
                    │  │                                  │    │
                    │  │  ┌──────────┐  ┌─────────────┐  │    │
                    │  │  │  API     │  │  Frontend   │  │    │
                    │  │  │  REST    │  │  Estáticos  │  │    │
                    │  │  └────┬─────┘  └─────────────┘  │    │
                    │  │       │                          │    │
                    │  │  ┌────▼──────┐  ┌────────────┐  │    │
                    │  │  │WebTorrent │  │  FFmpeg    │  │    │
                    │  │  │  Client  │  │ Transcode  │  │    │
                    │  │  └────┬──────┘  └────────────┘  │    │
                    │  └───────┼──────────────────────────┘    │
                    │          │                               │
                    │  ┌───────▼──────┐  ┌────────────────┐   │
                    │  │ PostgreSQL16 │  │    Jackett     │   │
                    │  │  (usuarios,  │  │  (indexador    │   │
                    │  │  watchlist,  │  │   torrents)    │   │
                    │  │  sesiones)   │  │                │   │
                    │  └──────────────┘  └────────────────┘   │
                    └─────────────────────────────────────────┘
                           │                    │
                    ┌──────▼──────┐    ┌────────▼────────┐
                    │  TMDB API   │    │  Red BitTorrent  │
                    │ (catálogo)  │    │  (peers P2P)     │
                    └─────────────┘    └─────────────────┘
```

### Flujo de reproducción de un torrent

```
1. Usuario busca "Inception" → TMDB resuelve el título en inglés
2. Backend consulta Jackett + TPB + YTS en paralelo → lista de torrents
3. Usuario elige torrent → player.html se abre en nueva ventana
4. Simultáneamente: app.js hace prefetch /api/torrent/info (torrent empieza
   a conectarse a peers ANTES de que el player cargue)
5. Player solicita GET /api/torrent/transcode?magnet=...&index=0
6. Backend: WebTorrent conecta peers → descarga piezas secuencialmente
7. FFmpeg lee el stream del torrent por pipe → convierte audio a AAC →
   envía fragmented MP4 al navegador en tiempo real
8. El navegador reproduce el video con el elemento <video> nativo
```

---

## Funcionalidades principales

### Catálogo de películas
- Búsqueda por texto con resultados de TMDB
- Películas populares, tendencias, por género
- Ficha completa: sinopsis, reparto, rating, año, duración
- Plataformas de streaming disponibles por país (Netflix, Disney+, etc.)

### Autenticación de usuarios
- Registro y login con contraseña hasheada (bcrypt)
- Sesiones seguras con tokens en base de datos
- Control de roles: usuario estándar y administrador
- Modo familiar (restricción de contenido adulto para menores)

### Watchlist personal
- Agregar / eliminar películas con estado personalizable
- Calificación propia, notas, estado (pendiente / viendo / completada)

### Búsqueda y reproducción de torrents
- Búsqueda multi-proveedor simultánea:
  - **Jackett** (integra decenas de indexadores privados y públicos)
  - **The Pirate Bay** (via apibay.org)
  - **YTS** (películas en alta calidad)
- Filtros: calidad (4K / 1080p / 720p), idioma (latino, español, inglés)
- **Streaming directo en el navegador** — sin descargar el archivo completo
- Conversión de audio automática AC3/DTS → AAC (compatibilidad total)
- **Modo Ahorro de datos** 📶 — transcoding a 720p ~1.8 Mbps (≈10× menos datos vs. 1080p original de 15-20 Mbps)

---

## Estructura del proyecto

```
MOVI-/
├── server.js                  # Entry point: Express app, rutas auth, TMDB, watchlist
├── swagger.js                 # Definición OpenAPI 3 de todos los endpoints
├── config/
│   ├── cors.js                # Configuración dinámica de CORS
│   └── database.js            # Conexión Sequelize → PostgreSQL
├── models/
│   ├── User.js                # Modelo usuario (bcrypt, roles)
│   ├── Session.js             # Tokens de sesión
│   └── Watchlist.js           # Colección personal por usuario
├── routes/
│   └── torrentRoutes.js       # GET /search, /info, /file, /transcode
├── services/
│   ├── torrentService.js      # WebTorrent client, streaming, FFmpeg transcode
│   └── jackettService.js      # Cliente HTTP para Jackett
├── models/movie-plus-frontend/
│   ├── index.html             # Página principal (catálogo)
│   ├── login.html / login.js  # Autenticación
│   ├── app.js                 # Lógica frontend principal (~1600 líneas)
│   ├── player.html            # Reproductor de torrent
│   └── style.css / login.css  # Estilos
├── nginx/
│   └── nginx.conf             # Reverse proxy, HTTPS, TLS 1.2/1.3, HSTS
├── Dockerfile.backend         # Imagen Node.js + FFmpeg + appuser (non-root)
├── Dockerfile                 # Imagen frontend (nginx:alpine)
├── docker-compose.yml         # Stack base: backend, frontend, db, jackett
├── docker-compose.prod.yml    # Override prod: nginx, restart:always, sin puertos expuestos
└── scripts/
    ├── azure-deploy.sh        # Script de despliegue automático
    ├── backup.sh              # Backup de PostgreSQL
    └── restore.sh             # Restauración de backup
```

---

## Decisiones técnicas destacadas

### ¿Por qué WebTorrent en el servidor y no en el cliente?
Los navegadores no pueden conectarse a la red BitTorrent directamente (sin extensiones). Al procesar el torrent en el servidor, cualquier navegador moderno puede reproducir sin instalación extra.

### ¿Por qué FFmpeg?
Los archivos MKV suelen llevar audio AC3 o DTS (Dolby/DTS). Ningún navegador soporta estos codecs de forma nativa. FFmpeg los convierte a AAC en tiempo real mediante un pipe (sin guardar en disco) mientras envía el video fragmentado al cliente.

### ¿Por qué fragmented MP4 (`-movflags frag_keyframe+empty_moov`)?
El MP4 estándar necesita el átomo `moov` al principio del archivo para reproducirse. Como el archivo aún no existe completo (se descarga en streaming), usamos fragmented MP4 que permite reproducción progresiva desde el primer fragmento.

### Seguridad del contenedor
El backend corre como usuario `appuser` (sin privilegios root) dentro del contenedor, siguiendo el principio de mínimo privilegio.

### ¿Por qué dos docker-compose?
`docker-compose.yml` funciona en desarrollo (puertos expuestos, sin nginx). `docker-compose.prod.yml` es un overlay que añade nginx, cierra los puertos directos y activa `restart: always`.

---

## Instalación local

### Requisitos
- Docker 24+ y Docker Compose v2+
- Git

### Pasos

```bash
# 1. Clonar
git clone https://github.com/daaavm25/MOVI-.git
cd MOVI-

# 2. Variables de entorno
cp .env.example .env
# Editar .env con tu TMDB_API_KEY y DB_PASSWORD

# 3. Levantar
docker compose up -d --build

# 4. Acceder
# App:      http://localhost:8000
# API docs: http://localhost:8000/docs/
```

### Variables de entorno principales

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `TMDB_API_KEY` | **Sí** | Clave de The Movie Database |
| `DB_PASSWORD` | **Sí** | Contraseña PostgreSQL |
| `FRONTEND_URL` | Prod | Orígenes CORS (separados por coma) |
| `ADMIN_USERNAMES` | No | Usernames con acceso admin |
| `JACKETT_API_KEY` | No | Generada automáticamente por Jackett |

---

## API — Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor y base de datos |
| GET | `/peliculas?query=` | Buscar películas en TMDB |
| GET | `/peliculas/populares` | Películas populares |
| GET | `/peliculas/:id/proveedores` | Plataformas disponibles por país |
| POST | `/auth/register` | Crear cuenta |
| POST | `/auth/login` | Iniciar sesión |
| GET | `/watchlist` | Obtener colección personal |
| POST | `/watchlist` | Añadir película |
| DELETE | `/watchlist/:id` | Eliminar de colección |
| GET | `/api/torrent/search?query=` | Buscar torrents multi-proveedor |
| GET | `/api/torrent/info?magnet=` | Info de archivos del torrent |
| GET | `/api/torrent/file?magnet=&index=` | Stream directo (MP4/WebM) |
| GET | `/api/torrent/transcode?magnet=&index=&saver=` | Stream con audio AAC (saver=1 → 720p) |
| GET | `/docs/` | Documentación Swagger interactiva |

---

## Despliegue en producción (Azure)

```
VM:         Standard_D2s_v3 · Ubuntu 22.04
IP:         20.25.227.81
Dominio:    movi-app.northcentralus.cloudapp.azure.com
HTTPS:      Let's Encrypt (válido hasta 2026-08-20, auto-renovable)
```

```bash
# Desplegar actualizaciones en Azure
rsync -az --exclude='.git' --exclude='node_modules' . azureuser@20.25.227.81:/home/azureuser/MOVI-/
ssh -i ~/.ssh/movi_azure_rsa azureuser@20.25.227.81 \
  "cd ~/MOVI- && sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
```

---

## Comandos útiles

```bash
# Logs en tiempo real del backend
docker compose logs -f backend

# Estado de todos los contenedores
docker compose ps

# Reiniciar solo el backend
docker compose restart backend

# Parar (datos persisten en volúmenes)
docker compose down

# Parar y eliminar TODO incluyendo datos
docker compose down -v

# Ejecutar tests de la API
node tests/api.test.js
```

---

## Seguridad implementada

- Contraseñas hasheadas con **bcrypt** (salt rounds 12)
- Tokens de sesión aleatorios (crypto.randomBytes) almacenados en BD
- Contenedor backend corre como **usuario sin root**
- nginx aplica **HSTS**, `X-Frame-Options`, `X-Content-Type-Options`
- **TLS 1.2 y 1.3** únicamente (sin versiones inseguras)
- CORS configurado explícitamente por origen
- Sin credenciales en el repositorio (variables de entorno vía `.env`)


---

## Tecnologías utilizadas

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | Node.js 20, Express 5 |
| Base de datos | PostgreSQL 16 (Sequelize ORM) |
| Contenedores | Docker + Docker Compose |
| Torrent indexer | Jackett + Torrentio API |
| Catálogo de películas | TMDB API |
| Infraestructura | Azure VM (Ubuntu) |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                     Azure VM                            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend   │  │   Backend    │  │   Jackett    │  │
│  │  Nginx:8080  │  │  Express:8000│  │   :9117      │  │
│  └──────────────┘  └──────┬───────┘  └──────────────┘  │
│                           │                             │
│                    ┌──────▼───────┐                     │
│                    │ PostgreSQL   │                     │
│                    │   :5432      │                     │
│                    └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

El backend (puerto 8000) sirve también el frontend como archivos estáticos, por lo que la app es accesible en un solo punto.

---

## Requisitos previos

- Docker 24+
- Docker Compose v2+
- Git

---

## Instalación y ejecución

### 1. Clonar el repositorio

```bash
git clone https://github.com/daaavm25/MOVI-.git
cd MOVI-
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

```env
TMDB_API_KEY=tu_api_key_de_tmdb
FRONTEND_URL=http://localhost:8080,http://localhost:8000
DB_PASSWORD=tu_password_seguro
JACKETT_API_KEY=generada_automaticamente_por_jackett
```

### 3. Levantar todos los servicios

```bash
docker compose up -d
```

La aplicación estará disponible en:
- **App principal:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs/
- **Frontend (nginx):** http://localhost:8080

### 4. Verificar que todo funciona

```bash
curl http://localhost:8000/health
```

---

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `NODE_ENV` | No | `development` o `production` (default: development) |
| `PORT` | No | Puerto del backend (default: 8000) |
| `HOST` | No | Interfaz de red (default: 0.0.0.0) |
| `FRONTEND_URL` | **Sí en prod** | Orígenes CORS permitidos, separados por coma |
| `TMDB_API_KEY` | **Sí** | Clave de API de The Movie Database |
| `TMDB_BASE_URL` | No | URL base TMDB (default: https://api.themoviedb.org/3) |
| `TMDB_PROVIDER_COUNTRY` | No | País para proveedores streaming (default: MX) |
| `DB_HOST` | No | Host PostgreSQL (default: db en Docker) |
| `DB_PORT` | No | Puerto PostgreSQL (default: 5432) |
| `DB_NAME` | No | Nombre de la base de datos (default: cinesphere) |
| `DB_USER` | No | Usuario PostgreSQL (default: postgres) |
| `DB_PASSWORD` | **Sí** | Contraseña PostgreSQL |
| `JACKETT_URL` | No | URL interna de Jackett (default: http://jackett:9117) |
| `JACKETT_API_KEY` | No | Clave API de Jackett |
| `ADMIN_USERNAMES` | No | Usernames con acceso admin, separados por coma |

---

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servidor y BD |
| GET | `/peliculas?query=` | Buscar películas |
| GET | `/peliculas/populares` | Películas populares |
| GET | `/peliculas/genero/:genero` | Películas por género |
| GET | `/peliculas/:id` | Detalle de película |
| GET | `/peliculas/:id/proveedores` | Plataformas de streaming |
| POST | `/auth/register` | Registro de usuario |
| POST | `/auth/login` | Inicio de sesión |
| POST | `/auth/logout` | Cerrar sesión |
| GET | `/auth/me` | Usuario autenticado |
| GET | `/watchlist` | Obtener colección personal |
| POST | `/watchlist` | Agregar película a colección |
| PUT | `/watchlist/:id` | Actualizar item |
| DELETE | `/watchlist/:id` | Eliminar item |
| GET | `/api/torrent/search?query=` | Buscar torrents |
| GET | `/docs/` | Documentación Swagger |

Ver documentación completa en: http://20.25.227.81:8000/docs/

---

## Persistencia de datos

Los datos persisten automáticamente gracias a volúmenes Docker:

- `pgdata` — base de datos PostgreSQL (usuarios, watchlist, sesiones)
- `webtorrent-data` — caché de streaming de torrents
- `jackett-config` — configuración de indexers de Jackett

Hacer `docker compose down` **no borra los datos**. Solo `docker compose down -v` elimina los volúmenes.

---

## Comandos útiles

```bash
# Ver logs del backend
docker compose logs -f backend

# Reiniciar un servicio
docker compose restart backend

# Ver estado de contenedores
docker compose ps

# Parar todo (datos persisten)
docker compose down

# Parar y eliminar datos (cuidado)
docker compose down -v
```

---

## Tests

```bash
# Ejecutar tests funcionales de la API
node tests/api.test.js
```

---

## Despliegue en Azure

El proyecto está desplegado en una Azure VM usando Docker Compose. El script de despliegue automático se encuentra en `scripts/azure-deploy.sh`.

**Plataforma:** Azure VM (Standard B2s, Ubuntu 22.04)  
**IP pública:** 20.25.227.81  
**Puertos abiertos:** 8000 (app), 8080 (frontend nginx), 9117 (Jackett)

---

## Propuesta de valor única (PVU)

Movie+ integra búsqueda de torrents en tiempo real como funcionalidad diferenciadora:
- Búsqueda multi-proveedor: Jackett, Torrentio/Stremio, TPB, YTS
- Filtros por idioma (latino, español, inglés, etc.) y calidad (4K, 1080p, 720p)
- Resolución automática de título en inglés vía TMDB para mejores resultados
- Reproductor de streaming por torrent integrado en la misma interfaz
