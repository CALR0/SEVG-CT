# ControlT · Referencia de APIs descubiertas

Documento de referencia para consumir desde Postman o integrar a futuro.
Todo lo documentado aquí fue identificado por ingeniería inversa sobre las
vistas oficiales (`auth.controlt.io`, `reports-ui.controlt.io`,
`tower.controlt.com.co`), observando las llamadas que la SPA hace a sus
backends.

> ControlT no publica documentación oficial de estas APIs. El comportamiento
> puede cambiar sin aviso. Validar contra la UI cuando se detecte una
> regresión.

---

## 1. Hosts

| Host | Rol |
|---|---|
| `https://app.controlt.com.co` | Autenticación (login, discovery) |
| `https://reports-api.controlt.io` | Reportes y bitácoras (sirve activos y finalizados) |
| `https://tower-api.controlt.com.co` | Torre de Control en tiempo real (viajes activos + alarmas) |

**El único header obligatorio es** `Authorization: Bearer <token>`. Los headers que la SPA envía adicionalmente (`Accept`, `Time-Zone`, `id-Company`) son opcionales — la API responde 200 sin ellos. Un mismo token sirve para los tres hosts.

---

## 2. Autenticación

### 2.1 Login (usuario/contraseña)

```http
POST https://app.controlt.com.co/apipublic/api/login/oauth
Content-Type: application/json

{ "username": "tu-email@...", "password": "tu-contraseña" }
```

Respuesta (200):
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 43200
}
```

Dura ~12 h. El mismo `access_token` autentica en `reports-api` y en `tower-api`.

### 2.2 Discovery (ver si el usuario es password u OAuth Microsoft)

```http
GET https://app.controlt.com.co/apipublic/api/login?email={email}
```

Sin auth. Si devuelve `authMethod: "oauth"` (o similar), el usuario usa Microsoft SSO — se activa un flow Cognito con PKCE no cubierto aquí.

### 2.3 Estructura del JWT

Decodificar la parte 2 del token (base64url). El payload trae:
```json
{
  "exp": 1793180379,
  "infoUser": "{\"idUser\":...,\"idCompany\":616346,\"name\":\"...\",...}"
}
```

`infoUser` es un **string JSON** — hay que hacer `JSON.parse` dos veces: una al payload del JWT y otra al string `infoUser`. [jwt.io](https://jwt.io) lo decodifica con pegar el token.

---

## 3. reports-api.controlt.io · Reportes y bitácoras

Usado por el dashboard "Reportes · Viajes Terminados". Sólo lectura.

### 3.1 Resolver manifiesto → id (solo FINALIZADOS)

```http
GET /Tracking/AllFinished/ByIdCompany/{idCompany}/1/10?search={manifiesto}
Authorization: Bearer {token}
```

Respuesta:
```json
[{ "idWorkOrder": 8148650, "tripNumber": "0101224058", "licensePlate": "SRC481" }]
```

Si el manifiesto está en curso (no finalizado), devuelve `[]`. Para esos hay que ir a `tower-api/Home/resumeForUI` (ver sección 4.1).

### 3.2 Información del viaje (FINALIZADO)

```http
GET /Tracking/InformationTracking/Finished/ByIdTracking/{idWorkOrder}
```

Devuelve `{ idMonitoringOrder, tripNumber, licensePlate, nameDriver, identificationDriver, origin, destiny, dateCreated, typeOperation, typeTrip, … }`.

### 3.3 Bitácora completa — **sirve para activos y finalizados**

```http
GET /Binnacle/{id}?size=0&page=0
```

**Este es el endpoint universal de bitácora.** El `{id}` puede ser:
- `idWorkOrder` de `/Tracking/AllFinished/…` (viaje finalizado), o
- `id_monitoring_order` de `/Home/resumeForUI` (viaje activo).

Verificado: el mismo endpoint responde 200 con la bitácora completa en los dos casos.

Cada item:
```json
{
  "id_monitoring_order": 8148650,
  "trip_number": "0101224058",
  "license_plate": "SRC481",
  "type_novelty": "Viaje Finalizado",
  "alarm": "...",
  "date_novelty_ct": "10/27/2026T02:00:26",
  "date_attend_ct": "10/27/2026T02:00:26",
  "username": "Camilo Andres Rodriguez",
  "management": "viaje finalizado...",
  "type_location": "Localidad",
  "description": "COCEDA",
  "address": "11.2193;-74.1678",
  "type_services": "Alarm",
  "temperature": 0,
  "hasImage": false,
  "email_content": null,
  "trackingPhoto": "..."
}
```

> Nota: `reports-api/Binnacle` **no** trae los campos GPS extras que sí trae `tower-api/Binnacle` (`speed`, `latitude`, `longitude`, `priority`, etc. — ver sección 4.4). Si necesitas esos datos, usa el host de Tower.

### 3.4 Mapa (auxiliares)

```http
GET /Map/{id}/stops                      → paradas del viaje
GET /Map/{id}/route                      → ruta planeada
GET /Map/{id}/{licensePlate}/gps         → puntos GPS del vehículo
```

---

## 4. tower-api.controlt.com.co · Torre de Control (tiempo real)

Usado por el dashboard de monitoreo en vivo.

> La UI usa un **Web Worker** (`Fetch.webworker.js`) para hacer las peticiones a `tower-api` (no se ven en el panel Network principal del navegador). Pero los endpoints son HTTP estándar — desde Postman se consumen igual que los de `reports-api`.

### 4.1 Lista de viajes activos (Summary)

```http
GET /Home/resumeForUI?search={q}&size={n}&page={p}
```

Query params:
- `search`: texto libre (manifiesto, placa, conductor, origen, destino). Vacío trae todos.
- `size`: items por página (ej. 50).
- `page`: 1-based.

Respuesta:
```json
{
  "info": {
    "count": 123, "page": 1, "pages": 3, "next": 2, "prev": 0,
    "statistics": {
      "started": 10, "loading": 5, "inTransit": 80,
      "pernocte": 2, "unloading": 15, "completed": 11
    }
  },
  "result": [ /* 55 campos por viaje — ver abajo */ ]
}
```

Campos por viaje (resumen por grupos — 55 en total):

| Grupo | Campos |
|---|---|
| Identificación | `id_monitoring_order`, `trip_number`, `shipment_number`, `number_order`, `remission`, `doc_ref_1`, `doc_ref_2`, `alias` |
| Vehículo | `license_plate`, `vehicle_typology` |
| Conductor | `driver_name`, `driver_phone`, `full_driver` |
| Empresas | `company_name`, `company_customer_name`, `company_transporter_name`, `id_company`, `id_company_customer` |
| Ruta | `origin_city_name`, `origin_location_name`, `destiny_city_name`, `destiny_location_name`, `description_route`, `stops`, `name_location_seller` |
| Estado | `state_travel`, `state_next_point`, `description_state_next_point`, `percentage_travel`, `novelty`, `source_update` |
| Posición | `latitude`, `longitude`, `current_address_location`, `latest_gps_report`, `latest_gps_report_Controlt` |
| Alarma reciente | `last_alarm_name`, `last_alarm_comment`, `date_last_alarm_comment`, `date_last_alarm_comment_export`, `last_event` |
| Temperatura | `temperature`, `trailer_temperature` |
| Operación | `business_unit`, `code_channel`, `type_operation`, `type_commodity`, `type_delivery`, `description_type_trip`, `is_master_route` |
| Citas | `appointment_fulfillment`, `appointment_fulfillment_state` |
| Trazabilidad | `created_on`, `activated_on`, `update_on`, `username`, `observations` |

### 4.2 Alarmas (historial)

```http
GET /Home/alarmsForUI?search={q}&size={n}&page={p}
```

Respuesta:
```json
{
  "info": { "count": 1200, "page": 1, "pages": 24, ... },
  "result": [
    {
      "id_monitoring_order_alarm": "...",
      "id_monitoring_order": "...",
      "id_company": "...",
      "trip_number": "...",
      "license_plate": "...",
      "alarm_name": "Exceso de velocidad",
      "priority": "Critica",
      "created_on": "...",
      "attended_by": "...",
      "id_comment": "...",
      "description": "...",
      "address": "...",
      "latest_gps_report": { ... }
    }
  ]
}
```

En este endpoint `priority` viene como **texto** (`"Critica" | "Alta" | "Baja"`).

### 4.3 Alarmas por atender

```http
GET /Home/alarms/attendForUI?search={q}&size={n}&page={p}
```

Mismos query params. A diferencia de `alarmsForUI`, aquí **viene tanto el texto como el id numérico** de priority (sección 4.5 lo explica):

```json
{
  "info": { "count": 35, "page": 1, "pages": 1, ... },
  "result": [
    {
      "id_alarm": "...",
      "id_monitoring_order_alarm": "...",
      "id_monitoring_order": "...",
      "id_company": "...",
      "company_name": "...",
      "trip_number": "...",
      "license_plate": "...",
      "driver_name": "...",
      "id_driver": "...",
      "alarm_name": "...",
      "priority": "Alta",
      "id_priority": 1,
      "status": "...",
      "user_who_reviews": "...",
      "address": "...",
      "create_on": "...",
      "latest_gps_report": { ... }
    }
  ]
}
```

### 4.4 Bitácora de viaje — versión tower (con datos GPS y priority numérico)

```http
GET /Binnacle/{idMonitoringOrder}?size=0&page=0
```

Mismo path que `reports-api/Binnacle/{id}` pero en `tower-api`. Diferencias con la versión reports-api:

- **Trae campos extra** útiles cuando el viaje está activo: `speed`, `latitude`, `longitude`, `idTrackingInfoGPS`, `priority`, `id_monitoring_orders_alarm`, `id_novelty_mobileComments`, `id_tracking_pc`, `maxSpeed`, `minPercentage`, `overnight_interruption_reason`, `hasAlarmManualImage`.
- `priority` llega como **número** (ver sección 4.5).

Útil cuando quieres análisis de alarmas con su criticidad o enganchar la ubicación GPS de cada evento.

### 4.5 Catálogo de prioridades de alarma

**No existe un endpoint de catálogo** (`/Catalog/Priority`, `/Priorities`, etc. → todos 404). El mapeo se infiere cruzando los endpoints. Confirmado con 1 260 registros:

| `priority` (número en Binnacle y `id_priority`) | `priority` (texto en UI) | Significado | Ejemplos |
|:-:|---|---|---|
| **0** | Crítica | Acción inmediata, más severa | `FUERA DE RUTA`, `Alarma manual` |
| **1** | Alta | Importante no crítica, operativa | `LLAMADA DE SEGUIMIENTO`, `DEMORA EN RUTA`, `SALIDA DEL DESTINATARIO`, `LLEGADA A SITIO CARGUE` |
| **2** | *(reservado, probable "Media"; no vista en tus datos)* | — | — |
| **3** | Baja | Informativa | `PROXIMIDAD DE DESTINO` |
| **null** | — | No es alarma gestionable (GPS automático, cambio de zona, pernocte sin alarma) | — |

Helper:
```js
const label = { 0: 'Crítica', 1: 'Alta', 2: 'Media', 3: 'Baja' }[event.priority] ?? 'Sin alarma';
```

Para identificar si un registro de bitácora es alarma real: `priority !== null` o `type_services === "Alarm"`.

### 4.X Viajes por monitorear (programados, aún no activados)

```http
GET /Home/travelsForUI?search={q}&size={n}&page={p}
```

Devuelve los viajes que están **asignados pero aún no han salido** (los que se ven en la vista `/home/tripsToMonitor` de la UI).

Respuesta:
```json
{
  "info": { "count": 236, "page": 1, "pages": 5, ... },
  "result": [
    {
      "id_monitoring_order": "7230457",
      "trip_number": "0101212743",
      "company_customer_name": "...",
      "id_company_customer": 123,
      "city_origin": "BUENAVENTURA",
      "city_destination": "PALMIRA",
      "license_plate": "SYU930",
      "driver_name": "NELSON SANDOVAL VA…",
      "origin_address": "CRA 11 BUENAVENTURA VALLE DEL CAUCA",
      "schedulate_origin": "",
      "id_company": 616346,
      "latest_gps_report": "...",
      "latest_gps_report_Controlt": "..."
    }
  ]
}
```

**Campo relevante**: `schedulate_origin` = fecha/hora programada para que el viaje arranque desde el origen (cita de origen).

### 4.6 Información del viaje activo

```http
GET /Tracking/TripInformation/{idMonitoringOrder}
```

Equivalente de `reports-api/Tracking/InformationTracking/Finished/ByIdTracking/{id}` pero para viajes en curso.

### 4.7 Validar existencia de un viaje por manifiesto

```http
GET /Tracking/ByTripNumber/{manifiesto}
```

Devuelve `true` o `false`. Útil como check rápido antes de hacer el resolver completo. No da el id.

### 4.8 Conteo rápido de alarmas por atender

```http
GET /Home/alarms/attend/count
```

Devuelve el número del badge rojo del menú lateral.

### 4.9 Citas pactadas (programación de origen y destino)

Las citas pactadas que se ven en el modal "EDITAR VIAJE" (fecha y hora del Origen y del Destino) vienen en campos específicos de otros endpoints — **no hay un endpoint único de "citas" por viaje**.

| Dato | Endpoint | Campo |
|---|---|---|
| Cita programada del **origen** de un viaje por monitorear | `GET /Home/travelsForUI?search={M}` | `schedulate_origin` (fecha/hora) |
| Cita programada del **destino** + ETA de un viaje activo | `GET /Home/resumeForUI?search={M}` | `appointment_fulfillment` (texto humano:<br>"La fecha aproximada de llegada al Destino es DD/MM/YYYY HH:mm:ss y la fecha programada es DD/MM/YYYY HH:mm:ss") |
| Estado del cumplimiento | `GET /Home/resumeForUI` | `appointment_fulfillment_state`, `description_state_next_point` (ej. "A TIEMPO") |
| Cantidad de paradas | `GET /Home/resumeForUI` | `stops` (como string, ej. `"2"`) |
| Índice del próximo punto | `GET /Home/resumeForUI` | `state_next_point` (ej. `"1"`) |

**Nota**: el modal "EDITAR VIAJE" muestra Origen + Destino con sus citas respectivas en una interfaz estructurada, pero según la captura de tráfico solo dispara `GET /Hub/CurrentPosition/{placa}` al abrirse. Las fechas por parada individual se renderizan con datos que la SPA probablemente carga desde `resumeForUI` + `travelsForUI` y combina en memoria. Para reconstruir el objeto "Origen + fecha / Destino + fecha" desde la API hay que parsear el texto de `appointment_fulfillment` (regex) o cruzar `travelsForUI.schedulate_origin` con el texto de la cita de destino.

Ejemplo de parser para `appointment_fulfillment`:
```js
const m = trip.appointment_fulfillment.match(
  /llegada al Destino es (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}).*programada es (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/
);
const etaDestino = m ? m[1] : null;         // fecha aproximada de llegada
const citaDestino = m ? m[2] : null;         // fecha programada de cita
```

### 4.10 Columnas configurables de la tabla de resumen

```http
GET /Home/resume/filter/ConfigurationColumns
```

37 definiciones de columnas con flags `active`, `hasFilter`, `hasOrder`. Útil si quieres reconstruir una tabla con los mismos campos visibles que la UI oficial.

---

## 5. Seguridad y permisos (tower-api)

### 5.1 Vistas/módulos disponibles para la empresa

```http
GET /Home/modulesAvailables
```

Devuelve 54 vistas agrupadas por módulo:

| idModule | Área | Vistas (subset) |
|---|---|---|
| 1 | Torre de Control | Alarmas por atender, Torre de control, Alarmas, Paradas, Bitácoras, Viajes por monitorear, Paso PC, Inspecciones, Siniestros, Información del viaje, Mapa |
| 2 | Viajes y Suite | Solicitar viaje, Filtros, Configuración, Alarmas Manuales, Suite, Reportes, Hub, Ver Ruta, Exportar, Bandera finalización, Lápiz edición, Cancelar Viajes, Asistente Virtual |
| 4 | Seguridad | Usuario, Perfiles, Grupos |
| 5 | Catálogos | Localidad, Destinatarios, Remolque, Tipos de Operación, Vehículos, Conductores, Zonas Alto Riesgo, Puestos de Control, Puntos de Referencia, Zonas Prohibidas, Zona de enturnamiento, Rutas, Canal, Unidad de negocio |
| 6 | Eventos | Tipo de Eventos, Tipificación de novedades, Matriz de condiciones, Eventos Externos, Novedades App |
| 7 | Administración | Compañías |

Flag `show: false` → la vista existe pero no aparece en el menú (ej. `Paso PC`, `Inspecciones`, `Siniestros`).

### 5.2 Otros

```http
GET /Security/TypeCompany/ByIdCompany/{idCompany}    → tipo de empresa
GET /Security/UserApplications                       → apps a las que accede el usuario
```

---

## 6. Flujo recomendado: analizar por manifiesto sin saber el estado

Dado un manifiesto `M`:

```
Paso 1 — Resolver manifiesto → id
  GET https://reports-api.controlt.io/Tracking/AllFinished/ByIdCompany/{idCompany}/1/10?search={M}
    → si count > 0  →  id = result[0].idWorkOrder               (estado: FINALIZADO)
    → si count = 0  → sigue al paso 1b

Paso 1b — Si no estaba finalizado, probar activos
  GET https://tower-api.controlt.com.co/Home/resumeForUI?search={M}&size=10&page=1
    → si result.length > 0 → id = result[0].id_monitoring_order  (estado: ACTIVO)
    → si count = 0         → el manifiesto no existe

Paso 2 — Bitácora (mismo endpoint para ambos estados)
  GET https://reports-api.controlt.io/Binnacle/{id}?size=0&page=0
  o (si quieres priority + GPS):
  GET https://tower-api.controlt.com.co/Binnacle/{id}?size=0&page=0

Paso 3 (opcional) — Información del viaje
  FINALIZADO → GET reports-api/Tracking/InformationTracking/Finished/ByIdTracking/{id}
  ACTIVO     → GET tower-api/Tracking/TripInformation/{id}
```

**Verificado** con dos manifiestos reales:
- `0101226629` (finalizado) → encontrado en reports, bitácora de 10 eventos.
- `0101225300` (activo, "En Transíto") → no aparece en reports, sí en tower; bitácora con 40 eventos descargada por `reports-api/Binnacle` sin problema.

---

## 7. Ejemplos completos listos para Postman

### 7.1 Setup del environment

Variables (crear environment "ControlT"):

| Variable | Valor |
|---|---|
| `token` | tu `access_token` del login |
| `idCompany` | de `infoUser.idCompany` dentro del JWT |

Script de post-login (pestaña **Tests** del login) — deja ambas vars automáticas:
```js
const j = pm.response.json();
const token = j.access_token;
const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
const info = JSON.parse(payload.infoUser);
pm.environment.set('token', token);
pm.environment.set('idCompany', info.idCompany);
console.log('idCompany:', info.idCompany, 'exp:', new Date(payload.exp * 1000));
```

En la colección: Authorization type → **Bearer Token** → `{{token}}`. No hace falta pasar más headers.

### 7.2 Cheatsheet de requests

```
# AUTH
POST https://app.controlt.com.co/apipublic/api/login/oauth
     body: {"username":"...", "password":"..."}

# VIAJES FINALIZADOS (reports-api)
GET  https://reports-api.controlt.io/Tracking/AllFinished/ByIdCompany/{{idCompany}}/1/10?search=0101226629
GET  https://reports-api.controlt.io/Tracking/InformationTracking/Finished/ByIdTracking/8333245

# BITÁCORA (universal — activos y finalizados)
GET  https://reports-api.controlt.io/Binnacle/8333245?size=0&page=0
GET  https://tower-api.controlt.com.co/Binnacle/8232035?size=0&page=0    # trae priority + GPS

# TORRE DE CONTROL (tiempo real, solo activos)
GET  https://tower-api.controlt.com.co/Home/resumeForUI?search=&size=50&page=1
GET  https://tower-api.controlt.com.co/Home/alarmsForUI?search=&size=50&page=1
GET  https://tower-api.controlt.com.co/Home/alarms/attendForUI?search=&size=50&page=1
GET  https://tower-api.controlt.com.co/Home/alarms/attend/count
GET  https://tower-api.controlt.com.co/Tracking/TripInformation/8232035
GET  https://tower-api.controlt.com.co/Tracking/ByTripNumber/0101225300

# CATÁLOGOS / PERMISOS
GET  https://tower-api.controlt.com.co/Home/modulesAvailables
GET  https://tower-api.controlt.com.co/Home/resume/filter/ConfigurationColumns
GET  https://tower-api.controlt.com.co/Security/UserApplications
GET  https://tower-api.controlt.com.co/Security/TypeCompany/ByIdCompany/{{idCompany}}
```

### 7.3 Script "bitácora por manifiesto" en un solo Send

Request: `GET reports-api/Tracking/AllFinished/ByIdCompany/{{idCompany}}/1/10?search={{manifest}}`

Pestaña **Tests**:
```js
const resolve = pm.response.json();
const manifest = pm.environment.get('manifest');
const token    = pm.environment.get('token');

function bajarBitacora(id, estado) {
  pm.sendRequest({
    url: `https://reports-api.controlt.io/Binnacle/${id}?size=0&page=0`,
    method: 'GET',
    header: { 'Authorization': 'Bearer ' + token }
  }, (_, res) => {
    const eventos = res.json();
    console.log(`Manifiesto ${manifest} (${estado}) · id ${id} · ${eventos.length} eventos`);
    pm.environment.set('bitacora', JSON.stringify(eventos));
    pm.environment.set('tripId', id);
    pm.environment.set('estado', estado);
  });
}

if (resolve.length > 0) {
  bajarBitacora(resolve[0].idWorkOrder, 'FINALIZADO');
} else {
  pm.sendRequest({
    url: `https://tower-api.controlt.com.co/Home/resumeForUI?search=${manifest}&size=10&page=1`,
    method: 'GET',
    header: { 'Authorization': 'Bearer ' + token }
  }, (_, res) => {
    const j = res.json();
    if (j.result && j.result.length > 0) {
      bajarBitacora(j.result[0].id_monitoring_order, 'ACTIVO');
    } else {
      console.log(`Manifiesto ${manifest} no existe`);
    }
  });
}
```

Un solo Send → trae la bitácora completa en `{{bitacora}}`, el id en `{{tripId}}` y el estado en `{{estado}}`.

### 7.4 cURL equivalentes (para probar en terminal)

```bash
# Login
curl -X POST https://app.controlt.com.co/apipublic/api/login/oauth \
  -H "Content-Type: application/json" \
  -d '{"username":"tu-email@...","password":"tu-password"}'

# Bitácora de un viaje finalizado (id 8333245)
curl -H "Authorization: Bearer $TOKEN" \
  "https://reports-api.controlt.io/Binnacle/8333245?size=0&page=0"

# Bitácora de un viaje activo con priority + GPS (id 8232035)
curl -H "Authorization: Bearer $TOKEN" \
  "https://tower-api.controlt.com.co/Binnacle/8232035?size=0&page=0"

# Lista de viajes activos
curl -H "Authorization: Bearer $TOKEN" \
  "https://tower-api.controlt.com.co/Home/resumeForUI?search=&size=50&page=1"

# Alarmas por atender
curl -H "Authorization: Bearer $TOKEN" \
  "https://tower-api.controlt.com.co/Home/alarms/attendForUI?search=&size=50&page=1"
```

---

## 8. Notas operativas

- Todos los endpoints documentados son **GET** — sólo lectura.
- Si recibes 401 en cualquier GET, el token expiró — vuelve a hacer el login.
- `reports-api/Binnacle/{id}` → sirve activos y finalizados; **NO trae** `priority` ni GPS.
- `tower-api/Binnacle/{id}` → sirve activos y finalizados; **SÍ trae** `priority`, GPS, extras.
- `tower-api/Home/resumeForUI` **solo trae activos** (no finalizados).
- `reports-api/Tracking/AllFinished/…` **solo trae finalizados**.
- No se detectaron límites de rate hardcoded. Evitar bucles sin throttle (la UI mueve ~1 req/s por acción humana).
- `size=0` en `Binnacle` significa "sin tope" — perfecto para traer toda la bitácora en una sola llamada.

---

## 9. Qué quedó fuera de esta referencia

Investigado pero no documentado aquí por no ser necesario para el caso de uso actual:
- Endpoints de Paradas, Bitácoras-vista (idView 7), Viajes por monitorear, Información del viaje (idView 53), Mapa (idView 54) — del módulo 1 Torre.
- Flujo OAuth Microsoft (Cognito con PKCE) para usuarios SSO.
- Endpoints de gestión (POST/PUT) — crear viajes, atender alarmas, modificar bitácoras. Existen pero son de escritura y fuera de scope.
- WebSockets o SignalR para refresco en vivo del Summary.
- El endpoint "Exportar" del módulo 2 (vista 46) que podría devolver .xlsx de un rango.
