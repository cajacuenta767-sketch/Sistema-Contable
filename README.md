# Sistema Contable

Sistema de gestión para estudios contables peruanos: clientes, tareas, control
del personal y cumplimiento de vencimientos SUNAT.

Es el **MVP del Sistema A** (gestión del estudio). El motor contable —libros
PLE, asientos, estados financieros— está diseñado en el esquema de datos pero
no implementado todavía; ver [Alcance](#alcance-de-esta-versión).

---

## Qué hace

| Módulo | Estado |
|---|---|
| Autenticación con roles (Administrador / Supervisor / Contador / Asistente) | ✅ |
| Clientes: RUC validado, régimen, cartera por contador | ✅ |
| Tareas con máquina de estados y bitácora inmutable | ✅ |
| Generación automática mensual desde plantillas recurrentes | ✅ |
| Cronograma SUNAT por último dígito de RUC | ✅ |
| Alertas de vencimiento dentro del sistema | ✅ |
| Dashboard de productividad y avance diario del personal | ✅ |
| Reportes diario / semanal / mensual | ✅ |
| Acceso desde computadora y celular (responsive) | ✅ |
| Libros electrónicos PLE, asientos, EEFF | ⬜ Fase 2 |
| Planillas / PLAME | ⬜ Fase 3 |

---

## Puesta en marcha

Requisitos: Node 20+ y PostgreSQL 14+.

```bash
# 1. Dependencias
npm install

# 2. Configuración
cp .env.example .env
# Genere un secreto real:
#   openssl rand -base64 48   -> AUTH_SECRET
#   openssl rand -hex 24      -> CRON_SECRET

# 3. Base de datos (con Docker)
docker compose up -d

# 4. Esquema y datos de ejemplo
npm run db:push
npm run db:seed

# 5. Genere las tareas del periodo y algo de actividad de demostración
npm run jobs:generate-tasks
npm run demo:activity

# 6. Arranque
npm run dev
```

Abra http://localhost:3000 e ingrese con:

| Correo | Rol |
|---|---|
| `admin@estudio.pe` | Administrador |
| `supervisor@estudio.pe` | Supervisor |
| `ana@estudio.pe` | Contador |
| `carla@estudio.pe` | Asistente |

Contraseña para todos: `Contable2026!` (solo datos de ejemplo).

---

## Comandos

```bash
npm run dev                  # desarrollo
npm run build                # compilación de producción
npm run start                # servidor de producción
npm run typecheck            # TypeScript en modo estricto
npm test                     # pruebas del dominio y de los casos de uso
npm run db:push              # sincroniza el esquema (desarrollo)
npm run db:migrate           # migración versionada (producción)
npm run db:seed              # datos de ejemplo
npm run db:studio            # explorador de la base
npm run jobs:generate-tasks  # expande las plantillas del periodo anterior
npm run demo:activity        # mueve tareas por la máquina de estados (demo)
```

---

## Tareas programadas

Dos jobs sostienen la operación. Se pueden invocar por HTTP (con
`Authorization: Bearer $CRON_SECRET`) o por CLI.

```cron
# Generación mensual: el día 1 a las 6:00, para el periodo anterior
0 6 1 * *  curl -fsS -X POST https://tu-dominio/api/jobs/generate-tasks \
             -H "Authorization: Bearer $CRON_SECRET"

# Alertas de vencimiento: cada hora en horario de oficina
0 8-19 * * 1-6  curl -fsS -X POST https://tu-dominio/api/jobs/due-alerts \
                  -H "Authorization: Bearer $CRON_SECRET"
```

Ambos son **idempotentes**: se pueden ejecutar de más, reintentar o solapar sin
duplicar tareas ni inundar de notificaciones. La garantía no está en un `if` del
código sino en restricciones de la base (índice único
`clientId + templateId + period` y único sobre `dedupeKey`), que sí resisten dos
ejecuciones simultáneas.

---

## Carga del cronograma SUNAT

El último dígito del RUC determina la fecha límite de todas las declaraciones de
un cliente. Cada año SUNAT publica el cronograma por resolución y hay que
cargarlo en la tabla `sunat_due_dates`.

Si el cronograma del periodo **no** está cargado, el sistema no se detiene:
calcula una **fecha estimada** escalonada por dígito y lo informa en el resumen
del job (`estimatedDueDates` y un aviso explícito). Esas fechas sirven para
planificar, **no para declarar**, y deben corregirse al publicarse la resolución.

---

## Arquitectura

Ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) para el detalle completo:
capas, flujo de datos, decisiones y sus motivos.

En resumen:

```
src/
├── core/                  ← el negocio. Sin Next, sin Prisma, sin HTTP.
│   ├── domain/            ← reglas puras: RUC, periodos, estados, permisos
│   └── application/
│       ├── ports/         ← interfaces que el núcleo EXIGE
│       └── use-cases/     ← orquestación de las reglas
├── infrastructure/        ← implementaciones: Prisma, bcrypt, JWT
│   └── container.ts       ← raíz de composición (el único que los une)
├── app/                   ← Next.js: páginas y API
├── components/            ← UI accesible y reutilizable
└── lib/                   ← utilidades de borde (HTTP, sesión, validación)
```

La regla que sostiene todo: **las dependencias apuntan hacia adentro**.
`core/` no importa nada de `infrastructure/` ni de `app/`. Por eso los tests del
dominio corren en milisegundos sin levantar una base de datos.

---

## Seguridad

- Contraseñas con bcrypt (12 rondas). El login verifica un hash ficticio cuando
  el usuario no existe, para que el tiempo de respuesta no permita enumerar
  correos registrados.
- Sesión en cookie `httpOnly` + `sameSite=lax` + `secure` en producción: un XSS
  no puede leerla y un sitio externo no puede reutilizarla.
- Autorización **en el núcleo**, no en las rutas: un contador o asistente recibe
  su filtro de alcance dentro del caso de uso, así una ruta nueva no puede
  "olvidarse" de aplicarlo.
- Un recurso fuera del alcance devuelve **404, no 403**: un 403 confirmaría que
  el recurso existe.
- Los jobs se autentican con comparación en tiempo constante.
- Toda consulta usa parámetros; no hay concatenación de SQL.
- Los errores internos nunca llegan al navegador: se registran en el servidor y
  el cliente recibe un mensaje genérico con un código de referencia.

---

## Alcance de esta versión

**Lo que este sistema hace:** organiza el trabajo del estudio y evita que se
pasen vencimientos.

**Lo que no hace, y conviene tener claro:**

1. **No presenta declaraciones ante SUNAT.** No existe una API pública para
   hacerlo desde un sistema externo; la presentación se hace en SUNAT
   Operaciones en Línea o con los programas de SUNAT. El sistema controla que se
   haga y registra la constancia.
2. **No calcula tributos ni genera libros.** El esquema de datos está preparado
   para el módulo contable (Fase 2), pero no está implementado.
3. **Las fechas estimadas no son oficiales.** Ver
   [Carga del cronograma SUNAT](#carga-del-cronograma-sunat).
4. **Requiere mantenimiento anual.** Los formatos PLE y el cronograma cambian
   por resolución. No es un sistema que se instala y se olvida.
