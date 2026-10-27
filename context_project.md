# Context del Proyecto · SEGV-CT

Documento vivo con el estado técnico, decisiones de diseño, trabajo realizado y pasos pendientes.

> Última actualización: 2026-10-27.

---

## 1. Contexto

El usuario (supervisor de tráfico, Elogia Soluciones Logísticas) partía de un **HTML monolítico** (`docs/legacy/dashboard_trazabilidad_v8_8_carpeta.html`, 862 líneas) que carga una carpeta de bitácoras `.xlsx` exportadas manualmente desde ControlT y las evalúa en el navegador con un motor **v8.8**.

**Dolor del flujo manual**: por cada viaje finalizado hay que entrar a `reports-ui.controlt.io`, pegar el manifiesto, esperar a que cargue y pulsar "Exportar a Excel". Para 50 viajes por día son 50 clics y 50 descargas antes de poder analizar.

**Objetivo**: automatizar la ingesta y presentar los resultados en una webapp alineada al HTML original, hospedable en Vercel.

---

## 2. Investigación realizada

### Interceptación de la API de ControlT

Hecha vía Claude in Chrome contra la cuenta real del usuario con hook de `fetch`/`XMLHttpRequest` que capturó solo metadatos (nunca valores de token).

Hallazgos:

- **Auth host**: `app.controlt.com.co`
  - `GET /apipublic/api/login?email=…` → discovery (dice si usa password u OAuth Microsoft)
  - `POST /apipublic/api/login/oauth` body `{username, password}` → responde `{access_token, token_type, expires_in}`
  - El JWT trae un claim `infoUser` que es un **string JSON** con `{idUser, idCompany, name, …}` dentro.
  - El endpoint `/apipublic/api/login/sso` es solo para el intercambio de código de Cognito (SSO Microsoft), no para password.
- **Reports host**: `reports-api.controlt.io`
  - `GET /Tracking/AllFinished/ByIdCompany/{idCompany}/1/10?search={manifiesto}` → `[{idWorkOrder, tripNumber, licensePlate}]`
  - `GET /Binnacle/{idWorkOrder}?size=0&page=0` → JSON de la bitácora completa (igual al que la UI usa para armar el .xlsx client-side).
  - `GET /Tracking/InformationTracking/Finished/ByIdTracking/{id}` → datos del viaje.
- **Auth header**: `Authorization: Bearer <JWT>` + `Time-Zone: America/Bogota` + `Accept: application/json`.

**Validado con manifiestos reales**: `0101225290 → idWorkOrder 8231947`, `0101225326 → 8232505`, `0101224058 → 8148650`.

### Decisión arquitectónica clave

El cliente nunca ve el JWT. Toda llamada a ControlT va vía las API routes de Next, que leen la cookie sellada y añaden el header.

---

## 3. Arquitectura

### Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14.2 (App Router, Node 20 runtime) |
| Lenguaje | TypeScript estricto + JS para el motor (portado 1:1) |
| UI | Tailwind 3.4 + CSS variables (dark mode con `data-theme`) |
| Fuente | Inter (Google Fonts) |
| Spreadsheet | SheetJS 0.20.3 (desde CDN SheetJS, no npm) |
| ZIP | JSZip 3.10 |
| Hosting | Vercel (Node runtime) |

### Flujo de autenticación

```
Browser POST /api/auth/login { email, password }
            │
            ▼
Next route (lib/controlt.ts)
  1. loginDiscover(email)          → GET  app.controlt.com.co/apipublic/api/login?email=
  2. loginPassword(email, password)→ POST app.controlt.com.co/apipublic/api/login/oauth
  3. Decode JWT → leer claim `infoUser` → extraer idCompany
  4. sealSession({token, idCompany, email, exp, name}) con AES-GCM + PBKDF2
  5. Set-Cookie: ct_session=<sealed>; HttpOnly; Secure; SameSite=Lax; Path=/
            │
            ▼
Cliente recibe { ok: true, email, name, idCompany, exp }
```

### Flujo de análisis

```
Browser POST /api/trips/resolve { manifests: [...] }
            │
            ▼
Next route
  getSession() → unseal cookie → Session
  Para cada manifiesto:
    GET reports-api.controlt.io/Tracking/AllFinished/ByIdCompany/{idCompany}/1/10
         ?search={manifiesto}
    → match el que coincide exacto o el primero del arreglo
  Respuesta: [{manifest, idWorkOrder, tripNumber, licensePlate} | {error}]
            │
            ▼
Browser (p-limit 5 en paralelo)
  Por cada idWorkOrder:
    GET /api/trips/binnacle/{idWorkOrder}
        │
        ▼
    Next route
      Promise.all([fetchBinnacle, fetchTripInfo])
      Respuesta: { idWorkOrder, info, binnacle }
            │
            ▼
Browser
  tripFromBinnacle(binnacle, info, manifest)   ← lib/engine.js
      → arma records[] con la misma forma que parseWorkbook del .xlsx
  evaluateTrip(tripInput)                      ← lib/engine.js (motor v8.8)
      → TripResult con scores, findings, alarmas, faltantesOp, ops, etc.
  Append al estado + render inmediato de los 5 paneles
```

### Flujo de importación `.xlsx`

```
Input file → ArrayBuffer → XLSX.read → parseWorkbook(wb, fileName, XLSX)
    → Array<Trip>
    → evaluateTrip() por cada uno
    → Append al estado
```

**Clave**: el mismo `evaluateTrip` consume ambos caminos; la equivalencia JSON ↔ xlsx está garantizada por `tripFromBinnacle` y `parseWorkbook` normalizando a la misma estructura de `records`.

---

## 4. Trabajo realizado

### Hitos

1. ✅ Interceptación de la API de ControlT con hook en navegador (metadata-only).
2. ✅ Esqueleto Next.js + login proxy funcional.
3. ✅ Flujo de analizar: resolver manifiestos → bajar bitácoras → mostrar tabla.
4. ✅ Export `.xlsx` consolidado + ZIP de bitácoras individuales (en el mismo formato que el export manual).
5. ✅ Import `.xlsx` local (mismo pipeline).
6. ✅ Rediseño UI alineado a marca ControlT (azules + naranja), dark mode, header SEGV-CT con avatar de iniciales, loading overlays en login/logout.
7. ✅ Motor v8.8 portado 1:1 desde el HTML a `lib/engine.js`.
8. ✅ 5 paneles del HTML implementados como componentes React (Resumen, Ranking, Operarios, Criterios, Hallazgos críticos).
9. ✅ Modal detallado por viaje con scores por criterio, durations, hallazgos agrupados, acciones recomendadas, operarios.
10. ✅ Checkbox "No castigar exceso de velocidad" con re-evaluación en vivo.
11. ✅ Dedup de manifiestos con normalización de ceros a la izquierda.
12. ✅ Acumulación de análisis (manifiestos + archivos) en la misma sesión + botón "Limpiar sesión".
13. ✅ Optimización de performance: memoización por entrada, `React.memo` en paneles pesados, debounce en búsqueda, sin `backdrop-blur` en móvil.
14. ✅ Seguridad: middleware con CSP + HSTS + XFO + rate limit por IP + validación de inputs + cookie sellada con AES-GCM.

### Decisiones intencionales

- **Motor en JS puro, no reescrito a TS**: evitar divergencia con el HTML original. Tipos en `engine.d.ts`.
- **No persistencia en servidor**: la sesión es stateless, no hay base de datos. Si el servidor cae, el usuario re-logea; nada se pierde porque la bitácora siempre está disponible en ControlT.
- **Vercel KV / Upstash deferido**: rate limit en memoria sirve para un único instance; si Vercel escala, migrar a KV. No es bloqueante.
- **Soporte OAuth Microsoft diferido**: solo password. Para empresas con SSO, usar password cuando esté habilitado en ControlT.
- **No se expone `/api/trips/*` sin cookie**: middleware devuelve 401 directamente.
- **Legalización se respeta**: si una bitácora trae "Legalización de viaje", el motor la excluye (regla v8.8).

---

## 5. Variables de entorno

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `SESSION_SECRET` | ✅ | — | Cadena aleatoria ≥16 chars (recomendado ≥32). Usada por PBKDF2 para derivar la clave AES-GCM. **Rotarla invalida todas las cookies.** |
| `CONTROLT_AUTH_BASE` | ❌ | `https://app.controlt.com.co` | Host de login. |
| `CONTROLT_REPORTS_BASE` | ❌ | `https://reports-api.controlt.io` | Host de reportes. |
| `CONTROLT_TZ` | ❌ | `America/Bogota` | Valor del header `Time-Zone`. |

Nunca commitear `.env.local`. Está ignorado por `.gitignore` y `.vercelignore`.

---

## 6. Pendientes / Backlog

- [ ] **OAuth Microsoft** (`/apipublic/api/login/sso` con callback de Cognito). Requiere PKCE y manejar `code + codeVerifier`.
- [ ] **Multi-instancia**: migrar rate limit a Vercel KV o Upstash cuando se habilite autoscale.
- [ ] **Caché de bitácoras**: IndexedDB en cliente para no re-bajar la misma bitácora en la misma sesión.
- [ ] **Export PDF** (solo .xlsx y ZIP hoy).
- [ ] **Modo "paquete"** para empresas con varios supervisores: dashboard agregado por rol.
- [ ] **Tests**: hoy no hay suite. Mínimo deseable: snapshot de `evaluateTrip` con bitácoras de referencia para detectar regresiones del motor.
- [ ] **Alertas**: webhook/email cuando un viaje queda MUY DEFICIENTE.

---

## 7. Despliegue en Vercel (paso a paso)

### Prerequisitos

- Cuenta de GitHub (o GitLab/Bitbucket).
- Cuenta de Vercel vinculada a GitHub.
- Git local configurado.

### 7.1 Preparar el repo

Desde la raíz del proyecto (donde está `package.json`):

```bash
git init
git add .
git commit -m "feat: SEGV-CT - análisis de viajes finalizados ControlT"
git branch -M main
git remote add origin https://github.com/CALR0/SEVG-CT.git
git push -u origin main
```

### 7.2 Importar en Vercel

1. En https://vercel.com/new elige tu repo.
2. **Root Directory**: `./` (dejar el default — el `package.json` ya está en la raíz del repo).
3. **Framework Preset**: Next.js (se detecta automáticamente).
4. **Build Command**: déjalo por defecto (`next build`).
5. **Install Command**: por defecto (`npm install`).
6. **Output Directory**: por defecto (`.next`).

### 7.3 Variables de entorno

En **Settings → Environment Variables** del proyecto, añade:

| Name | Value | Environments |
|---|---|---|
| `SESSION_SECRET` | Resultado de `openssl rand -base64 48` (o 48+ caracteres aleatorios) | Production, Preview, Development |

Opcionales (si cambian los hosts de ControlT):
- `CONTROLT_AUTH_BASE`
- `CONTROLT_REPORTS_BASE`
- `CONTROLT_TZ`

### 7.4 Deploy

Pulsa **Deploy**. Primer build tarda 1–2 minutos. La URL quedará como `https://<proyecto>.vercel.app`.

### 7.5 Dominio personalizado (opcional)

**Settings → Domains → Add**. Vercel genera los registros DNS; añádelos en tu proveedor. HTTPS y HSTS se activan solos.

### 7.6 Verificar seguridad post-deploy

Prueba la URL en:
- https://securityheaders.com → debe dar grado **A** o superior.
- https://observatory.mozilla.org → debe pasar HSTS, CSP, XFO.
- Devtools → Application → Cookies → `ct_session` debe tener `HttpOnly ✓`, `Secure ✓`, `SameSite=Lax`.

### 7.7 Operación

- **Actualizar**: `git push` a `main` → Vercel re-despliega automático.
- **Rollback**: en Vercel → Deployments → clic en una previa → **Promote to Production**.
- **Logs**: Vercel → Deployments → Runtime Logs. Ahí verás 401/429 si hay fuerza bruta.
- **Rotar `SESSION_SECRET`**: cambia la env var y re-despliega. Todos los usuarios tendrán que re-logearse.

### 7.8 Monitoreo

- Vercel Analytics (gratis el nivel básico): tráfico, Core Web Vitals.
- Vercel Firewall (opcional, de pago): bloquear IPs sospechosas y proteger APIs.

---

## 8. Riesgos conocidos

| Riesgo | Mitigación actual | Mejora futura |
|---|---|---|
| ControlT cambia nombres de endpoints o shape del JSON | Hoy falla con 502 y log claro | Snapshot tests + alerta en CI |
| JWT expira a mitad de análisis | Operación individual falla con 401, el resto sigue | Refresh token (no documentado por ControlT) |
| Carga alta de requests concurrentes a ControlT | Limitador en servidor (p-limit 5) | Hacer configurable por operador |
| Fuga del `SESSION_SECRET` | Rotación manual | Vault / KMS en empresa |
| Usuario comparte sus credenciales | Fuera de nuestro alcance | Política de uso en README |

---

## 9. Glosario

| Término | Significado |
|---|---|
| **Manifiesto** | Número de viaje visible al usuario (ej. `0101224058`). También llamado "tripNumber". |
| **idWorkOrder** / **idMonitoringOrder** | ID interno de ControlT (ej. `8148650`). Lo necesita la API de bitácora. |
| **Bitácora** | Secuencia cronológica de novedades del viaje. En ControlT es un arreglo JSON; en la UI del usuario era un .xlsx. |
| **Legalización** | Novedad administrativa que ControlT inyecta cuando un viaje queda cerrado. El motor v8.8 la trata como motivo de exclusión del análisis. |
| **TripResult** | Objeto que devuelve `evaluateTrip` con los scores, findings, alarmas, etc. de un viaje. |
