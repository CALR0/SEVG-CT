# SEGV-CT

Webapp para analizar bitácoras de viajes finalizados en ControlT. Pegas manifiestos o importas `.xlsx`, el motor v8.8 evalúa trazabilidad, resultado se guarda por mes en Postgres y queda disponible aunque cierres sesión.

**Stack**: Next.js 14 (App Router) · TypeScript · Tailwind · SheetJS · Neon Postgres · Vercel.

---

## Cómo funciona

```
Browser ──► Next API routes ──► ControlT API
                │
                ├─ /api/auth/*          Login proxy, JWT sellado en cookie HttpOnly
                ├─ /api/trips/*         Resolver manifiesto → id, bajar bitácora JSON
                └─ /api/history/*       Persistencia Neon (opcional)
```

- El JWT de ControlT nunca llega al navegador. Vive cifrado (AES-GCM) en la cookie `ct_session`.
- Motor en `lib/engine.js` — portado 1:1 del dashboard HTML original (ver `docs/legacy/`). No se reescribe para no divergir.
- Dos fuentes alimentan al mismo `evaluateTrip`: JSON de la API (`tripFromBinnacle`) y `.xlsx` locales (`parseWorkbook`).
- Guardamos el **input** del motor (records parseados), no el output. Reevaluar aplica reglas vigentes a datos históricos sin migración.

## Persistencia

Opcional. Si no está `DATABASE_URL`, la webapp funciona en modo memoria (sesión actual).

Con Neon activo:
- Cada análisis hace UPSERT en `analyses` keyed por `(user_email, manifest, month)`.
- Dashboard carga el mes actual al montar; selector arriba permite ver meses pasados.
- "Limpiar mes X" aparece solo en meses pasados (doble confirmación).
- Cambiar el toggle de velocidad reevalúa en vivo todos los viajes del mes cargado.

Volumen: ~30 MB/mes por supervisor. Neon free (500 MB) aguanta ~16 meses sin tocar nada.

## Rutas API

| | |
|---|---|
| `POST /api/auth/login` | Proxy a `app.controlt.com.co/apipublic/api/login/oauth`. Rate limit 10/10min por IP. |
| `POST /api/auth/logout` | Limpia cookie |
| `GET  /api/trips/resolve` | Manifiesto → `idWorkOrder`. Máx 200 por lote |
| `GET  /api/trips/binnacle/[id]` | Bitácora JSON + info del viaje |
| `POST /api/history/save` | UPSERT análisis |
| `GET  /api/history?month=YYYY-MM` | Lista análisis del mes |
| `DELETE /api/history?month=YYYY-MM` | Borra el mes |
| `GET  /api/history/months` | Meses con datos (alimenta el selector) |

Todas (salvo `/api/auth/login` y `/api/auth/logout`) exigen cookie de sesión — enforce vía `middleware.ts`.

## Correr local

```bash
cp .env.example .env.local      # añade SESSION_SECRET y DATABASE_URL
npm install
npm run dev                     # http://localhost:3000
```

Si no pones `DATABASE_URL`, el histórico queda deshabilitado pero el resto corre normal (modo memoria).

Para probar con la BD de producción local:
```bash
vercel env pull .env.local --environment=production
```

## Variables de entorno

| | | |
|---|---|---|
| `SESSION_SECRET` | **requerida** | Cadena aleatoria ≥32 chars. Deriva la llave AES-GCM. Rotarla invalida todas las cookies. |
| `DATABASE_URL` | opcional | Postgres (inyectada por Neon integration). Sin ella, histórico off. |
| `CONTROLT_AUTH_BASE` | opcional | Default `https://app.controlt.com.co` |
| `CONTROLT_REPORTS_BASE` | opcional | Default `https://reports-api.controlt.io` |
| `CONTROLT_TZ` | opcional | Default `America/Bogota` |

## Deploy en Vercel

1. Vercel → New Project → Import `CALR0/SEVG-CT`. Root `./`, framework Next.js (auto).
2. Environment Variables → añade `SESSION_SECRET` (generar con `openssl rand -base64 48`).
3. Deploy.
4. Para persistencia: Storage → Create → Neon → connect al proyecto (prefix vacío, Production marcado). Redeploy con `--force` para tomar la var.

Dominio custom se agrega en Settings → Domains.

## Seguridad

- Headers vía `middleware.ts`: CSP estricta, HSTS 2 años, X-Frame-Options DENY, Permissions-Policy restrictiva, `X-Powered-By` off.
- Rate limit por IP en login (`lib/rate-limit.ts`).
- Validación de inputs en API routes (regex + length cap).
- Scope por `user_email` en todas las queries → aislamiento entre supervisores.
- `robots.txt` deniega indexación.

## Estructura

```
app/
  api/{auth,trips,history}/   Rutas de servidor
  dashboard/
    DashboardClient.tsx       Orquestador cliente
    components/               Paneles 1-5, modal, selector de mes
  login/                      Pantalla de login
components/                   Header, iconos, hook de tema
lib/
  engine.{js,d.ts}            Motor v8.8 + tipos
  engine-types.ts             TripResult, Finding, etc.
  controlt.ts                 Cliente ControlT + sellado de sesión
  db.ts                       Cliente Neon + schema auto-init
  binnacle-xlsx.ts            Serializadores a .xlsx
  rate-limit.ts               Limitador por IP
middleware.ts                 Headers + guard de rutas
docs/legacy/                  HTML v8.8 original de referencia
```

## Decisiones de diseño

- **Motor en JS, no TS**: evitar divergencia con el HTML original. Tipado en `.d.ts` separado.
- **Guardar input, no output**: una nueva versión del motor (v8.9) reevalúa el histórico sin migración.
- **Sin ORM**: SQL directo con `@neondatabase/serverless`. 4 queries en total, no justifica Prisma.
- **Sin tests**: por ahora. Pendiente: snapshot de `evaluateTrip` con bitácoras de referencia.
- **No OAuth Microsoft**: solo password. Si una empresa lo necesita, implementar el flow de Cognito.

## Pendientes

- Snapshot tests del motor.
- Export PDF del consolidado.
- Caché en IndexedDB para evitar refetch de bitácoras recientes.
- Soporte OAuth Microsoft.
