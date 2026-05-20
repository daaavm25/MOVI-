# Movie+

Plataforma web de películas con búsqueda, watchlist personal, búsqueda de torrents y reproductor integrado.

**URL de producción:** http://20.25.227.81:8000  
**API Docs (Swagger):** http://20.25.227.81:8000/docs/  
**Health check:** http://20.25.227.81:8000/health

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
