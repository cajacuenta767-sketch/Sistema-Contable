# Arquitectura

## 1. Qué problema resuelve el diseño

Un estudio contable con 200+ clientes genera alrededor de **1.000 tareas nuevas
por mes** y unas **12.000 al año**. Dos consecuencias gobiernan casi todas las
decisiones técnicas de este sistema:

1. **Nada se carga a mano.** Las obligaciones periódicas se expanden desde
   plantillas. Si el proceso no es idempotente, un reintento duplica mil tareas.
2. **Nada se trae completo.** Toda lista pagina en servidor y toda métrica se
   agrega en SQL. Con este volumen, la diferencia entre una consulta y siete es
   la diferencia entre un dashboard instantáneo y uno que tarda segundos.

A eso se suma un tercer factor propio del dominio: **una fecha mal calculada
cuesta una multa**. Por eso el manejo de fechas y zonas horarias es explícito y
está probado, no implícito.

---

## 2. Capas

```
┌──────────────────────────────────────────────────────────┐
│  app/  ·  components/                                    │
│  Next.js: páginas, rutas de API, UI                      │
│  Traduce HTTP ⇄ casos de uso. No contiene reglas.        │
└────────────────────────┬─────────────────────────────────┘
                         │ depende de
┌────────────────────────▼─────────────────────────────────┐
│  core/application/use-cases/                             │
│  Orquesta: permisos, validación, llamadas a puertos      │
└────────────────────────┬─────────────────────────────────┘
                         │ depende de
┌────────────────────────▼─────────────────────────────────┐
│  core/domain/                                            │
│  Reglas puras. RUC, periodo tributario, máquina de       │
│  estados, cálculo de vencimientos, RBAC, productividad.  │
│  CERO dependencias externas.                             │
└──────────────────────────────────────────────────────────┘
                         ▲ implementa
┌────────────────────────┴─────────────────────────────────┐
│  infrastructure/                                         │
│  Prisma, bcrypt, jose, reloj del sistema                 │
└──────────────────────────────────────────────────────────┘
```

**La regla:** las flechas apuntan hacia adentro. `core/` no conoce a Next, ni a
Prisma, ni a HTTP.

Lo que esto compra, en concreto:

- Los tests del dominio corren en **~20 ms** sin levantar Postgres.
- El job mensual se prueba con dobles en memoria que replican la restricción
  única real de la base.
- Cambiar de ORM toca `infrastructure/` y `container.ts`. Nada más.

Lo que cuesta: más archivos y una capa de interfaces. Para un CRUD de tres
pantallas sería sobreingeniería; para un sistema que va a crecer hacia
contabilidad completa, es lo que evita que el módulo contable se enrede con el
de tareas.

---

## 3. Flujo de datos

### Lectura (una página)

```
Navegador → Server Component → caso de uso → repositorio → Postgres
                    ↑
              sin fetch HTTP
```

Los Server Components llaman **directamente** al caso de uso. Que el servidor se
llame a sí mismo por HTTP agrega un viaje de red, una serialización y una
deserialización a cambio de nada. La API REST existe para el navegador y para
integraciones futuras, no para el renderizado.

### Escritura (una acción)

```
Componente cliente → fetch → ruta de API → validación Zod → caso de uso
                                                                │
                                              permisos + reglas de dominio
                                                                │
                                                   repositorio → Postgres
                                                                │
                                            bitácora + notificación + auditoría
                        ← router.refresh() revalida el Server Component
```

`router.refresh()` en vez de duplicar el estado en el cliente: la tabla se
actualiza sin recargar la página y sin mantener dos fuentes de verdad.

---

## 4. Decisiones y sus motivos

### El estado "ATRASADA" no se guarda

Se **deriva** de `dueDate < ahora` y `status ≠ TERMINADA`. Persistirlo obligaría
a un proceso que reescriba filas cada medianoche y abriría la puerta a estados
inconsistentes entre lo que dice la fila y lo que dice el reloj.

Consecuencia: el filtro "solo atrasadas" se traduce en el repositorio a su
definición real, y el gráfico de estados usa categorías **disjuntas** (cada
estado abierto cuenta solo sus tareas en plazo; las vencidas van todas al
segmento "Atrasadas") para que los segmentos sumen exactamente el total.

### El periodo tributario es un string "YYYY-MM"

No es un `Date`. Un periodo es un mes calendario, no un instante: guardarlo como
fecha obliga a inventar un día y arrastra errores de zona horaria. Además
"YYYY-MM" ordena lexicográficamente igual que cronológicamente, así que los
índices y los rangos funcionan sin funciones.

### Las fechas límite se normalizan al fin del día en Lima

Todo se almacena en UTC, pero un vencimiento representa *el final del día hábil
en Lima*. Se guarda como las 23:59:59 hora peruana expresadas en UTC. Sin esto,
una tarea que vence "el 15" aparecería vencida a las 19:00 del día 14. Perú no
aplica horario de verano, así que el desfase es constante y el cálculo es
exacto. Está cubierto por tests.

### La idempotencia vive en la base, no en el código

El job mensual se apoya en el índice único `(clientId, templateId, period)` y en
`INSERT ... ON CONFLICT DO NOTHING`. Un chequeo previo en código
("¿ya existe?") pierde contra dos ejecuciones simultáneas del cron; una
restricción de integridad no.

Lo mismo con las alertas: `dedupeKey` único garantiza una notificación por tarea
y umbral aunque el job corra cada hora.

### Los KPIs se calculan en un solo recorrido

Los siete contadores del dashboard son filtros distintos sobre la misma tabla.
Con el query builder serían siete `count()`, es decir siete escaneos. Con
`COUNT(*) FILTER (WHERE ...)` de Postgres es **un** escaneo que resuelve los
siete. A tres años de operación esa diferencia se nota.

### Los permisos se resuelven en el núcleo

El alcance de un contador o asistente se aplica **dentro del caso de uso**, no
en la ruta:

```ts
const scoped = Permissions.canSeeEverything(user.role)
  ? filters
  : { ...filters, assigneeId: user.id }
```

Así una ruta nueva no puede "olvidarse" de filtrar. El middleware solo verifica
que la sesión esté firmada y redirige al login; no autoriza, porque un
middleware que autoriza es un middleware que se olvida de autorizar la ruta que
alguien agregue mañana.

### El reloj es una dependencia inyectada

`Clock` es un puerto. Ningún caso de uso hace `new Date()` suelto. Como toda la
lógica gira alrededor de fechas límite, los tests fijan "hoy" y son
deterministas.

---

## 5. Índices y su motivo

| Índice | Consulta que sostiene |
|---|---|
| `tasks(assigneeId, status, dueDate)` | "Mis tareas por vencer" — la consulta más frecuente |
| `tasks(status, dueDate)` | Tablero de vencimientos y detección de atrasos |
| `tasks(clientId, period)` | Ficha del cliente |
| `tasks(completedAt)` | Reportes de cierres por rango |
| `tasks(clientId, templateId, period)` **único** | Idempotencia del job mensual |
| `clients(status, businessName)` | Listado principal ordenado |
| `clients(accountantId, status)` | "Mi cartera" |
| `notifications(userId, readAt, createdAt)` | Bandeja: no leídas primero |
| `notifications(dedupeKey)` **único** | Deduplicación de alertas |

---

## 6. Rendimiento

Lo que ya está resuelto:

- **Sin N+1.** El listado de clientes trae los contadores de tareas de toda la
  página en dos agregaciones, no una por fila (con `pageSize=25` eso es la
  diferencia entre 3 consultas y 51).
- **Sin N+1 en el job.** El cronograma SUNAT se carga una vez como `Map` y se
  consulta en memoria 1.000 veces.
- **Inserción en lote** troceada de a 500 filas.
- **Paginación en servidor** con tope duro de 100: un cliente de la API no puede
  pedir `pageSize=100000`.
- **Consultas en paralelo** donde son independientes (`Promise.all`).
- **Un cliente de Prisma** cacheado en el objeto global: sin esto, el
  hot-reload de Next abre un pool nuevo en cada cambio hasta agotar las
  conexiones de Postgres.
- **Sondeo, no WebSocket**, para las notificaciones, y detenido cuando la
  pestaña no está visible.

Lo que falta cuando el volumen lo pida (no antes):

- Particionar `tasks` por periodo.
- Materializar `ProductivitySnapshot` con un job nocturno (la tabla ya existe).
- Mover el job mensual a una cola (BullMQ) si supera el tiempo de una petición.
- Índice de texto completo (`pg_trgm`) si la búsqueda por razón social se vuelve
  lenta; hoy `startsWith` sobre RUC ya usa índice.

---

## 7. Accesibilidad

No es un añadido: está en los componentes base, que es el único lugar donde una
decisión de accesibilidad se aplica sola en toda la aplicación.

- Etiquetas reales ligadas por `id`; un placeholder no es una etiqueta.
- Errores con `aria-describedby` + `aria-invalid` + `role="alert"`.
- Modales sobre `<dialog>` nativo: capa superior, fondo inerte y foco atrapado
  los da el navegador; el retorno del foco al cerrar se resuelve a mano.
- `aria-current="page"` en navegación y paginación.
- Tablas con `<caption>` y contenedor desplazable enfocable por teclado.
- Enlace "saltar al contenido" como primer elemento enfocable.
- **El color nunca es el único portador de significado**: cada estado lleva su
  texto, y los críticos además un punto.
- La paleta del gráfico fue validada con un verificador de contraste y
  daltonismo en modo claro y oscuro, **incluido el par de cierre del anillo**
  (en una dona el último segmento toca al primero). El orden de los segmentos es
  el mecanismo de seguridad: verde "terminada" y rojo "atrasada" nunca quedan
  contiguos, que es justo el par que un deuteranope no distingue.
- Todo gráfico tiene una tabla equivalente oculta para lectores de pantalla.
- `prefers-reduced-motion` respetado; el zoom nunca se bloquea.

---

## 8. Cómo crece hacia el módulo contable

El esquema ya reserva el espacio: `Document`, `AuditLog` y las relaciones por
cliente y periodo están diseñadas para soportarlo. La Fase 2 agrega su propio
agregado dentro de `core/domain/accounting/` sin tocar el de tareas.

Una advertencia que conviene dejar escrita: los importes contables **no deben
pasar por `number`**. Hoy `monthlyFee` se convierte a `number` porque es un
honorario de referencia y el redondeo es inocuo. En contabilidad no lo es: ahí
hay que trabajar con `Decimal` de extremo a extremo.
