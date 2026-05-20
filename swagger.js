const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Movie+ API',
    version: '1.0.0',
    description: 'API REST para Movie+: búsqueda de películas, watchlist, autenticación y torrents.'
  },
  servers: [
    { url: 'http://20.25.227.81:8000', description: 'Producción (Azure)' },
    { url: 'http://localhost:8000', description: 'Desarrollo local' }
  ],
  components: {
    securitySchemes: {
      tokenAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-auth-token'
      }
    },
    schemas: {
      Movie: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 27205 },
          titulo: { type: 'string', example: 'Inception' },
          original_title: { type: 'string', example: 'Inception' },
          original_language: { type: 'string', example: 'en' },
          categoria: { type: 'array', items: { type: 'integer' }, example: [28, 878] },
          imagen: { type: 'string', example: 'https://image.tmdb.org/t/p/w500/...' },
          fecha: { type: 'string', example: '2010-07-16' },
          descripcion: { type: 'string' }
        }
      },
      WatchlistItem: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          id_usuario: { type: 'integer' },
          external_id: { type: 'integer', example: 27205 },
          titulo: { type: 'string', example: 'Inception' },
          categoria: { type: 'string' },
          imagen: { type: 'string' },
          nota_personal: { type: 'string' }
        }
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' }
        }
      }
    }
  },
  paths: {
    '/health': {
      get: {
        summary: 'Estado del servidor',
        tags: ['Sistema'],
        responses: {
          200: { description: 'Servidor en línea', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, database: { type: 'string' } } } } } }
        }
      }
    },
    '/peliculas': {
      get: {
        summary: 'Buscar películas por título',
        tags: ['Películas'],
        parameters: [
          { name: 'query', in: 'query', required: true, schema: { type: 'string', minLength: 2 }, description: 'Título a buscar (mínimo 2 caracteres)' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 8, maximum: 20 } }
        ],
        responses: {
          200: { description: 'Lista de películas encontradas', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { '$ref': '#/components/schemas/Movie' } }, total: { type: 'integer' } } } } } },
          400: { description: 'Query demasiado corto', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } } }
        }
      }
    },
    '/peliculas/populares': {
      get: {
        summary: 'Obtener películas populares',
        tags: ['Películas'],
        parameters: [{ name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }],
        responses: {
          200: { description: 'Películas populares', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { '$ref': '#/components/schemas/Movie' } } } } } } }
        }
      }
    },
    '/peliculas/genero/{genero}': {
      get: {
        summary: 'Películas por género',
        tags: ['Películas'],
        parameters: [
          { name: 'genero', in: 'path', required: true, schema: { type: 'string', enum: ['accion', 'comedia', 'drama', 'terror', 'scifi', 'romance', 'animacion', 'suspenso'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['populares', 'menos_populares'] } }
        ],
        responses: {
          200: { description: 'Películas del género', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { '$ref': '#/components/schemas/Movie' } } } } } } },
          400: { description: 'Género desconocido' }
        }
      }
    },
    '/peliculas/{id}': {
      get: {
        summary: 'Detalle de una película por ID de TMDB',
        tags: ['Películas'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 27205 }],
        responses: {
          200: { description: 'Detalle de la película', content: { 'application/json': { schema: { '$ref': '#/components/schemas/Movie' } } } },
          400: { description: 'ID inválido' },
          500: { description: 'Error en TMDB' }
        }
      }
    },
    '/peliculas/{id}/proveedores': {
      get: {
        summary: 'Plataformas de streaming donde está disponible',
        tags: ['Películas'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, example: 27205 },
          { name: 'country', in: 'query', schema: { type: 'string', default: 'MX' }, description: 'Código de país ISO 3166-1 alpha-2' }
        ],
        responses: {
          200: { description: 'Lista de plataformas' }
        }
      }
    },
    '/auth/register': {
      post: {
        summary: 'Registrar nuevo usuario',
        tags: ['Autenticación'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['username', 'email', 'password'], properties: { username: { type: 'string', minLength: 3 }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 6 }, birth_date: { type: 'string', format: 'date' } } } } }
        },
        responses: {
          201: { description: 'Usuario creado' },
          400: { description: 'Datos inválidos' },
          409: { description: 'Usuario o email ya existe' }
        }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Iniciar sesión',
        tags: ['Autenticación'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' } } } } }
        },
        responses: {
          200: { description: 'Token de sesión generado', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' }, user: { type: 'object' } } } } } },
          401: { description: 'Credenciales incorrectas' }
        }
      }
    },
    '/auth/logout': {
      post: {
        summary: 'Cerrar sesión',
        tags: ['Autenticación'],
        security: [{ tokenAuth: [] }],
        responses: { 200: { description: 'Sesión cerrada' } }
      }
    },
    '/auth/me': {
      get: {
        summary: 'Obtener usuario autenticado',
        tags: ['Autenticación'],
        security: [{ tokenAuth: [] }],
        responses: {
          200: { description: 'Datos del usuario' },
          401: { description: 'No autenticado' }
        }
      }
    },
    '/watchlist': {
      get: {
        summary: 'Obtener watchlist del usuario',
        tags: ['Watchlist'],
        security: [{ tokenAuth: [] }],
        responses: {
          200: { description: 'Items de la watchlist', content: { 'application/json': { schema: { type: 'array', items: { '$ref': '#/components/schemas/WatchlistItem' } } } } },
          401: { description: 'No autenticado' }
        }
      },
      post: {
        summary: 'Agregar película a watchlist',
        tags: ['Watchlist'],
        security: [{ tokenAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['external_id', 'titulo'], properties: { external_id: { type: 'integer' }, titulo: { type: 'string' }, imagen: { type: 'string' }, categoria: { type: 'string' }, nota_personal: { type: 'string' } } } } }
        },
        responses: {
          201: { description: 'Película agregada' },
          400: { description: 'Ya está en la colección o faltan datos' },
          401: { description: 'No autenticado' }
        }
      }
    },
    '/watchlist/{id}': {
      put: {
        summary: 'Actualizar item de la watchlist',
        tags: ['Watchlist'],
        security: [{ tokenAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { nota_personal: { type: 'string' } } } } } },
        responses: { 200: { description: 'Actualizado' }, 404: { description: 'No encontrado' } }
      },
      delete: {
        summary: 'Eliminar item de la watchlist',
        tags: ['Watchlist'],
        security: [{ tokenAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Eliminado' }, 403: { description: 'No autorizado' }, 404: { description: 'No encontrado' } }
      }
    },
    '/api/torrent/search': {
      get: {
        summary: 'Buscar torrents para una película',
        tags: ['Torrents'],
        parameters: [
          { name: 'query', in: 'query', required: true, schema: { type: 'string' }, description: 'Título de la película' },
          { name: 'tmdbId', in: 'query', schema: { type: 'integer' }, description: 'ID de TMDB para resolución exacta de título e IMDB ID' },
          { name: 'year', in: 'query', schema: { type: 'integer' }, description: 'Año de estreno' },
          { name: 'lang', in: 'query', schema: { type: 'string', enum: ['en', 'es-lat', 'es-es', 'pt-br', 'fr', 'de', 'all'] }, description: 'Filtro de idioma' }
        ],
        responses: {
          200: { description: 'Lista de torrents encontrados', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, seeds: { type: 'integer' }, size: { type: 'string' }, magnet: { type: 'string' }, provider: { type: 'string' }, detectedLang: { type: 'string' }, detectedQuality: { type: 'string' } } } } } } } } },
          400: { description: 'Falta el parámetro query' },
          500: { description: 'Error interno' }
        }
      }
    }
  }
};

module.exports = swaggerSpec;
