/**
 * Functional API tests for Movie+ backend
 * Usage: node tests/api.test.js [baseUrl]
 * Example: node tests/api.test.js http://20.25.227.81:8000
 */

const BASE_URL = process.argv[2] || 'http://localhost:8000';
let passed = 0;
let failed = 0;
let authToken = null;

async function request(method, path, body = null, headers = {}) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json', ...headers }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, opts);
    let data;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
}

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ ${message}`);
        passed++;
    } else {
        console.error(`  ❌ ${message}`);
        failed++;
    }
}

async function test(name, fn) {
    console.log(`\n📋 ${name}`);
    try {
        await fn();
    } catch (err) {
        console.error(`  ❌ Error inesperado: ${err.message}`);
        failed++;
    }
}

// ─── Tests ───────────────────────────────────────────────────────

async function runTests() {
    console.log(`\n🚀 Movie+ API Tests → ${BASE_URL}\n${'─'.repeat(50)}`);

    await test('Health Check', async () => {
        const r = await request('GET', '/health');
        assert(r.status === 200, `GET /health → 200`);
        assert(r.data?.status === 'online', `status = "online"`);
        assert(r.data?.database === 'connected', `database = "connected"`);
    });

    await test('Búsqueda de películas', async () => {
        const r = await request('GET', '/peliculas?query=Inception');
        assert(r.status === 200, `GET /peliculas?query=Inception → 200`);
        assert(Array.isArray(r.data?.results), `response.results es array`);
        assert(r.data?.results?.length > 0, `Devuelve al menos 1 resultado`);
        assert(r.data?.results?.[0]?.id, `Resultado tiene campo id`);
        assert(r.data?.results?.[0]?.titulo, `Resultado tiene campo titulo`);
    });

    await test('Búsqueda con query muy corto → 400', async () => {
        const r = await request('GET', '/peliculas?query=a');
        assert(r.status === 400, `GET /peliculas?query=a → 400`);
        assert(r.data?.error, `Respuesta tiene campo error`);
    });

    await test('Películas populares', async () => {
        const r = await request('GET', '/peliculas/populares');
        assert(r.status === 200, `GET /peliculas/populares → 200`);
        assert(Array.isArray(r.data?.results), `results es array`);
        assert(r.data?.results?.length > 0, `Devuelve películas`);
    });

    await test('Películas por género', async () => {
        const r = await request('GET', '/peliculas/genero/accion');
        assert(r.status === 200, `GET /peliculas/genero/accion → 200`);
        assert(Array.isArray(r.data?.results), `results es array`);
    });

    await test('Género inválido → 400', async () => {
        const r = await request('GET', '/peliculas/genero/xyz123');
        assert(r.status === 400, `Género inexistente → 400`);
    });

    await test('Detalle de película (TMDB ID 27205 = Inception)', async () => {
        const r = await request('GET', '/peliculas/27205');
        assert(r.status === 200, `GET /peliculas/27205 → 200`);
        assert(r.data?.id === 27205, `id correcto`);
        assert(r.data?.titulo, `Tiene titulo`);
    });

    await test('ID de película inválido → 400', async () => {
        const r = await request('GET', '/peliculas/abc');
        assert(r.status === 400, `ID no numérico → 400`);
    });

    await test('ID de película inexistente → 404', async () => {
        const r = await request('GET', '/peliculas/99999999');
        assert(r.status === 404, `ID inexistente → 404`);
    });

    await test('Registro de usuario', async () => {
        const uniqueUser = `testuser_${Date.now()}`;
        const r = await request('POST', '/auth/register', {
            username: uniqueUser,
            email: `${uniqueUser}@test.com`,
            password: 'Test1234!'
        });
        assert(r.status === 201, `POST /auth/register → 201`);
        assert(r.data?.username === uniqueUser, `Username correcto`);
        assert(!r.data?.password_hash, `No expone password_hash`);
    });

    await test('Registro con datos inválidos → 400', async () => {
        const r1 = await request('POST', '/auth/register', { username: 'ab', email: 'test@test.com', password: 'pass123' });
        assert(r1.status === 400, `Username < 3 chars → 400`);

        const r2 = await request('POST', '/auth/register', { username: 'validuser', email: 'noemail', password: 'pass123' });
        assert(r2.status === 400, `Email inválido → 400`);

        const r3 = await request('POST', '/auth/register', { username: 'validuser', email: 'v@v.com', password: '123' });
        assert(r3.status === 400, `Password < 6 chars → 400`);
    });

    await test('Login y obtención de token', async () => {
        const user = `logintest_${Date.now()}`;
        await request('POST', '/auth/register', { username: user, email: `${user}@test.com`, password: 'Test1234!' });
        const r = await request('POST', '/auth/login', { username: user, password: 'Test1234!' });
        assert(r.status === 200, `POST /auth/login → 200`);
        assert(r.data?.token, `Devuelve token`);
        assert(r.data?.user?.username === user, `Username en respuesta`);
        authToken = r.data.token;
    });

    await test('Login con credenciales incorrectas → 401', async () => {
        const r = await request('POST', '/auth/login', { username: 'noexiste', password: 'wrong' });
        assert(r.status === 401, `Credenciales incorrectas → 401`);
    });

    await test('Auth: /auth/me con token válido', async () => {
        if (!authToken) { console.log('  ⚠️ Saltado: sin token'); return; }
        const r = await request('GET', '/auth/me', null, { 'x-auth-token': authToken });
        assert(r.status === 200, `GET /auth/me con token → 200`);
        assert(r.data?.username, `Tiene username`);
    });

    await test('Auth: /auth/me sin token → 401', async () => {
        const r = await request('GET', '/auth/me');
        assert(r.status === 401, `Sin token → 401`);
    });

    await test('Watchlist: agregar película (requiere auth)', async () => {
        if (!authToken) { console.log('  ⚠️ Saltado: sin token'); return; }
        const r = await request('POST', '/watchlist', {
            external_id: 27205, titulo: 'Inception', imagen: null, categoria: '28'
        }, { 'x-auth-token': authToken });
        assert([201, 400].includes(r.status), `POST /watchlist → 201 o 400 (ya existe)`);
    });

    await test('Watchlist: obtener lista (requiere auth)', async () => {
        if (!authToken) { console.log('  ⚠️ Saltado: sin token'); return; }
        const r = await request('GET', '/watchlist', null, { 'x-auth-token': authToken });
        assert(r.status === 200, `GET /watchlist → 200`);
        assert(Array.isArray(r.data), `Devuelve array`);
    });

    await test('Watchlist sin auth → 401', async () => {
        const r = await request('GET', '/watchlist');
        assert(r.status === 401, `Sin token → 401`);
    });

    await test('Búsqueda de torrents', async () => {
        const r = await request('GET', '/api/torrent/search?query=Inception&tmdbId=27205');
        assert(r.status === 200, `GET /api/torrent/search → 200`);
        assert(Array.isArray(r.data?.results), `results es array`);
        if (r.data?.results?.length > 0) {
            assert(r.data.results[0].title, `Torrent tiene título`);
            assert(r.data.results[0].magnet, `Torrent tiene magnet`);
        }
    });

    await test('Torrent search sin query → 400', async () => {
        const r = await request('GET', '/api/torrent/search');
        assert(r.status === 400, `Sin query → 400`);
    });

    await test('Swagger docs disponible', async () => {
        const res = await fetch(`${BASE_URL}/docs/`);
        assert(res.status === 200, `GET /docs/ → 200`);
    });

    // ─── Resumen ─────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📊 Resultados: ${passed} ✅ pasaron | ${failed} ❌ fallaron`);
    if (failed === 0) {
        console.log('🎉 Todos los tests pasaron\n');
        process.exit(0);
    } else {
        console.log('⚠️  Algunos tests fallaron\n');
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Error fatal en tests:', err.message);
    process.exit(1);
});
