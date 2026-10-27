# SEGV-CT · Seguimiento y Evaluación de Viajes Finalizados

Webapp Next.js que automatiza el análisis de trazabilidad de viajes finalizados en ControlT. Centraliza la descarga de bitácoras, aplica el motor de evaluación **v8.8** (portado 1:1 desde el dashboard HTML original) y presenta los resultados con las secciones del original pero rediseñados.

> **Estado**: funcional. Login + análisis por manifiesto + importación `.xlsx` + 5 paneles del HTML + exportes. Pendiente desplegar en Vercel.

---

## Resumen rápido

| | |
|---|---|
| **Nombre** | SEGV-CT |
| **Stack** | Next.js 14 (App Router) + TypeScript + Tailwind + SheetJS + JSZip |
| **Motor de análisis** | v8.8 portado desde `docs/legacy/dashboard_trazabilidad_v8_8_carpeta.html` |
| **Backend auth** | Proxy a `app.controlt.com.co` |
| **Backend datos** | Proxy a `reports-api.controlt.io` |
| **Dónde corre** | Vercel (o cualquier Node 20+) |
| **Persistencia** | Neon Postgres (opcional — modo memoria si falta `DATABASE_URL`) |

## Estructura del repositorio

```
SEVG-CT/                                   ← raíz del repo
├── README.md                              ← este archivo
├── context_project.md                     ← estado técnico detallado
├── app/                                   Rutas (App Router)
│   ├── layout.tsx                         Shell HTML + fuentes + bootstrap de tema
│   ├── page.tsx                           Redirige a /login o /dashboard
│   ├── login/                             Formulario de inicio de sesión
│   ├── dashboard/
│   │   ├── page.tsx                       Server component (guard de sesión)
│   │   ├── DashboardClient.tsx            Orquestador en cliente
│   │   └── components/                    Paneles 1-5, modal, tabla, input
│   └── api/                               Rutas de servidor (proxy a ControlT)
│       ├── auth/{login,logout,me}
│       ├── trips/{resolve,binnacle/[id]}
│       └── history/{save,months,[GET,DELETE]}   Persistencia mensual (Neon)
├── components/                            Header, iconos, hook de tema
├── lib/
│   ├── engine.js                          Motor v8.8 (portado del HTML)
│   ├── engine.d.ts                        Tipado para engine.js
│   ├── engine-types.ts                    Tipos TripResult, Finding, etc.
│   ├── controlt.ts                        Cliente de ControlT (cifrado de sesión)
│   ├── binnacle-xlsx.ts                   JSON → .xlsx con el mismo formato del export manual
│   ├── db.ts                              Cliente Neon + queries + auto-schema
│   └── rate-limit.ts                      Limitador por IP
├── middleware.ts                          Headers de seguridad + guard de rutas
├── public/
│   └── robots.txt                         No indexar (webapp interna)
├── vercel.json                            Config de despliegue + headers extra
├── next.config.js                         poweredByHeader off, compresión, etc.
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── docs/
    └── legacy/
        ├── dashboard_trazabilidad_v8_8_carpeta.html   HTML original de referencia
        └── bitacora_0101224058.xlsx                   Bitácora de muestra
```

---

## Cómo funciona

### Flujo del usuario

1. **Login** (`/login`) con usuario/contraseña de ControlT.
2. **Dashboard** (`/dashboard`): pega una lista de manifiestos **o** arrastra bitácoras `.xlsx` **o** combina ambos.
3. **Analizar**: el servidor resuelve cada manifiesto a su `idWorkOrder`, descarga el JSON de la bitácora, lo convierte a la estructura del motor y evalúa el viaje.
4. **Resultados**: 5 paneles idénticos al HTML original + modal detallado por viaje.
5. **Exportar**: `.xlsx` consolidado con ranking + hallazgos, o ZIP con las bitácoras individuales en formato compatible con el export manual de ControlT.

### Comunicación entre frontend y backend

```
┌─────────────────────┐     ┌─────────────────────────┐     ┌───────────────────────┐
│ Navegador (React)   │────▶│ API routes de Next      │────▶│ ControlT (API)        │
│  - Formulario login │     │  - /api/auth/login      │     │  app.controlt.com.co  │
│  - Pegar manifiestos│◀────│  - /api/trips/resolve   │◀────│  reports-api.         │
│  - Importar xlsx    │     │  - /api/trips/binnacle/*│     │     controlt.io       │
└─────────────────────┘     └─────────────────────────┘     └───────────────────────┘
       ▲                             │
       │                             │ Set-Cookie: ct_session (HttpOnly, cifrada AES-GCM)
       │                             │
       └─────────────────────────────┘
```

**Importante**: el navegador **nunca** ve el JWT de ControlT. Las llamadas a `reports-api.controlt.io` las hace el servidor de Next, que lee la cookie sellada, extrae el JWT y lo pone en el header `Authorization` del fetch saliente.

### Endpoints de ControlT que usamos

| Método | URL | Uso |
|---|---|---|
| `GET`  | `/apipublic/api/login?email=…` | Discovery (password vs. OAuth) |
| `POST` | `/apipublic/api/login/oauth` | Login usuario/password → JWT |
| `GET`  | `/Tracking/AllFinished/ByIdCompany/{idCompany}/1/10?search={manifiesto}` | Resolver manifiesto → `idWorkOrder` |
| `GET`  | `/Binnacle/{idWorkOrder}?size=0&page=0` | Bitácora completa (JSON) |
| `GET`  | `/Tracking/InformationTracking/Finished/ByIdTracking/{id}` | Datos del viaje (placa, conductor, etc.) |

Todas son **solo lectura**. La webapp jamás escribe en ControlT.

### Motor de evaluación

Está en `lib/engine.js`, portado 1:1 desde el bloque `/*ENGINE_START*/.../*ENGINE_END*/` del HTML original (`docs/legacy/dashboard_trazabilidad_v8_8_carpeta.html`, líneas 56–540). Decisión intencional: **no reescribir las reglas** para no divergir del comportamiento del HTML.

Exporta:
- `parseWorkbook(wb, filename, XLSX)` — para bitácoras importadas `.xlsx` locales.
- `tripFromBinnacle(binnacle, info, manifest)` — para JSON de la API; adapta los campos (`type_novelty → tipo`, `date_attend_ct → tAt`, etc.) a la **misma** estructura que `parseWorkbook`.
- `evaluateTrip(trip)` — el motor único.
- `calificacion`, `accionesDe`, `setIgnorarVelocidad`, `TAG_LABEL`, `ACCIONES`, `CRIT`, `GN`, `MARK_LABEL`.

Ambos caminos (JSON API y .xlsx local) terminan en `evaluateTrip`, garantizando paridad.

### Paneles

| # | Nombre | Qué muestra |
|---|---|---|
| 1 | **Resumen general** | KPIs totales + distribución por calificación + promedio por criterio |
| 2 | **Ranking de viajes** | Tabla filtrable y paginada con los 4 criterios + hallazgos cortos; excluidos aparte |
| 3 | **Desempeño por operario** | Marcas faltantes + tarjeta por operario con responsabilidades |
| 4 | **Análisis por criterio** | Promedio por criterio + frecuencia de hallazgos |
| 5 | **Hallazgos críticos transversales** | Patrones del equipo + alarmas de riesgo + viajes sin marcas + cierres prematuros |

---

## Seguridad

| Capa | Mitigación |
|---|---|
| Credenciales en tránsito | HTTPS obligatorio en Vercel (HSTS 2 años + preload) |
| JWT en el navegador | **No llega al navegador**. Vive sellado dentro de una cookie `HttpOnly`, `Secure`, `SameSite=Lax`. |
| Sellado de cookie | AES-GCM con PBKDF2 (100k iteraciones, SHA-256) usando `SESSION_SECRET` |
| CSRF | `SameSite=Lax` + POST a mismo origen. Las rutas `/api/*` no aceptan GET para mutaciones. |
| Clickjacking | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` |
| XSS | CSP estricta (`default-src 'self'`), `X-Content-Type-Options: nosniff`, no uso de `dangerouslySetInnerHTML` con datos externos |
| MITM | HSTS `max-age=63072000; includeSubDomains; preload` |
| Fuerza bruta de login | Rate limit 10 intentos/10 min por IP (`lib/rate-limit.ts`) |
| Abuso de API | Validación de forma + tope de 200 manifiestos/lote; `/api/trips/*` requiere cookie de sesión (middleware) |
| Fingerprinting | `X-Powered-By` deshabilitado |
| Indexación | `robots.txt` denegando toda ruta |
| Permisos de navegador | `Permissions-Policy` denegando cámara, mic, geo, FLoC |
| Logs | Nunca registramos contraseñas ni JWT completos. Logs del cliente usan `localStorage` y se limpian al cerrar sesión. |

### Buenas prácticas operativas

- **`SESSION_SECRET`** debe ser una cadena aleatoria de **≥32 caracteres** (`openssl rand -base64 48` o similar) y nunca commitearse.
- **Rotar `SESSION_SECRET`** cada 90 días o inmediatamente si hay sospecha de compromiso (invalida todas las cookies).
- **Monitorear** fallos 401/429 en los logs de Vercel.
- Para múltiples usuarios/empresas, cada quien entra con su propia cuenta ControlT; **nunca compartir credenciales**.
- **No habilitar OAuth Microsoft** hasta implementar el callback correctamente (fuera de alcance de la v1).

---

## Persistencia mensual (Neon Postgres)

**Opcional**: la webapp funciona sin ella (modo memoria durante la sesión).
Al activar `DATABASE_URL`, cada viaje analizado se guarda en Postgres y queda
disponible para consultar y filtrar mes a mes, incluso tras cerrar sesión o
cambiar de equipo.

**Setup en Vercel (una vez)**:

1. Dashboard de Vercel → tu proyecto → **Storage** → **Create Database** → **Neon**.
2. Nombre: `segv-ct-db` (o lo que prefieras). Región: la más cercana.
3. Vercel inyecta `DATABASE_URL` automáticamente en las 3 environments.
4. Redeploy. En el próximo análisis el esquema se crea solo (idempotente).

**Comportamiento**:
- Mes **actual**: puedes pegar manifiestos o importar `.xlsx`. Cada análisis se guarda al momento.
- Meses **pasados**: el selector arriba del dashboard los muestra; clic → ves y exportas lo del mes.
- Botón **Limpiar mes X** aparece solo cuando miras un mes pasado (doble confirmación).
- Al cambiar la casilla "No castigar exceso de velocidad", todos los viajes se **re-evalúan** con la regla nueva (incluidos los guardados).

**Volumen esperado**: ~30 MB/mes para 1 supervisor con 50 viajes/día. El tier gratis de Neon (500 MB · 190h compute/mes · sin tarjeta) aguanta más de un año sin tocar nada.

---

## Despliegue en Vercel

Ver instrucciones completas al final de `context_project.md`. Resumen:

```bash
# En vercel.com → New Project → Import https://github.com/CALR0/SEVG-CT
#    - Root Directory: ./        (dejar el default)
#    - Framework: Next.js (auto)
#    - Environment Variables:
#        SESSION_SECRET = <cadena aleatoria ≥32 chars>
#
# Deploy. La URL quedará disponible.
```

---

## Correr local

```bash
cp .env.example .env.local
# edita .env.local y define SESSION_SECRET
npm install
npm run dev        # http://localhost:3000
```

Si cambias `SESSION_SECRET`, las cookies previas quedan inválidas y los usuarios deben re-logearse (comportamiento esperado).
