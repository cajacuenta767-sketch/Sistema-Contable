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

---

## 9. Motor contable (Fase 2)

### El problema central: precisión

En contabilidad un error de redondeo no es cosmético. En punto flotante
`0.1 + 0.2 === 0.30000000000000004`; sumando cientos de comprobantes ese error
se acumula, el libro deja de cuadrar y una base imponible mal redondeada es una
declaración mal presentada.

Por eso hay un value object `Money` que representa el importe como **BigInt en
céntimos**. Nunca `number`.

```
Money.fromString('0.10').add(Money.fromString('0.20')).toString()  // "0.30"
Money.sum(Array(1000).fill(Money.fromString('0.01'))).toString()   // "10.00"
```

La regla se sostiene de extremo a extremo:

| Capa | Representación |
|---|---|
| Base de datos | `Decimal(15,2)`, nunca `Float` |
| Repositorio | conversión vía **cadena** (`decimal.toString()`), nunca `.toNumber()` |
| Dominio | `Money` (BigInt) |
| API | cadena (`"1234.56"`), nunca número JSON |
| Interfaz | cadena ya formateada; el navegador no recalcula |

Un JSON con `1234.56` obligaría al cliente a parsearlo como double, y cualquier
suma en el navegador reintroduciría el error que todo el backend evita.

**Un solo redondeo por cálculo.** `Money.compute({ multiplyBy, divideBy })`
acumula el producto completo en BigInt y redondea una única vez al final.
Encadenar multiplicaciones redondea en cada paso: una hora extra calculada como
`(sueldo / 30 / 8)` redondeado, por horas, por 1.25, difiere en céntimos del
cálculo directo `sueldo × horas × 1.25 / 240`. En una planilla de cien
trabajadores esa diferencia se ve, y el trabajador la reclama.

### Invariantes que no se negocian

1. **Ningún asiento entra descuadrado.** La validación de partida doble vive en
   el dominio y se aplica igual al asiento manual que al automático. Además se
   revalida al confirmar: entre creación y confirmación el asiento pudo
   editarse, y uno confirmado descuadrado envenena todo el mayor.

2. **Un periodo cerrado no admite escrituras.** Un periodo cerrado es un periodo
   ya declarado; si se le agregan asientos, los libros dejan de coincidir con la
   declaración presentada. Reabrir exige el permiso más alto y queda auditado.

3. **Un asiento confirmado no se borra: se extorna.** Se crea el asiento inverso
   y ambos quedan. Borrar destruye el rastro, y en contabilidad el rastro es el
   punto.

4. **Las cuentas de agrupación no reciben movimiento.** Cargar en «60 Compras»
   en vez de en «6011 Mercaderías manufacturadas» impide analizar y rompe el
   libro electrónico.

5. **Ningún estado financiero se emite sobre un balance descuadrado.** Si las
   sumas no coinciden hay un asiento mal grabado, y presentar un EEFF construido
   encima sería presentar una cifra falsa. El caso de uso lo rechaza con el
   motivo.

### Libros electrónicos (PLE)

Las estructuras viven en `ple/layout.ts` como **datos**, no repartidas por el
código: SUNAT las cambia por resolución, y actualizar debe ser editar una tabla,
no tocar la lógica de generación.

Tres detalles de formato que hacen rechazar el archivo si se omiten, y que están
cubiertos por tests:

- Cada línea termina **también** en `|`, no solo separa con él.
- El salto de línea es **CRLF**, no LF.
- La codificación es **Latin-1**, no UTF-8. Una razón social con eñe enviada en
  UTF-8 llega corrupta al validador.

Un `|` dentro de una razón social corre todas las columnas siguientes y corrompe
el archivo entero: se neutraliza al serializar.

Cada generación deja constancia con el **hash SHA-256** del contenido y la
versión de estructura usada. Si SUNAT observa un libro meses después, hay que
poder demostrar exactamente qué se presentó y cuándo.

### Fechas de calendario

Una fecha de emisión es un **día de calendario**, no un instante. Un input
`type="date"` envía `"2026-08-20"`, y `new Date("2026-08-20")` lo interpreta
como medianoche UTC — que en Lima es el 19 a las 19:00. Guardada así, una
factura del 20 se exporta al PLE como del 19.

El esquema de entrada normaliza toda fecha de calendario al **mediodía UTC**,
con lo que el día es el mismo en cualquier zona horaria relevante. Hay tests de
regresión para esto.

---

## 10. Planillas (Fase 3)

### Los parámetros no viven en el código

UIT, remuneración mínima, tasas de EsSalud y SCTR, tramos de renta y comisiones
de AFP están en base de datos, con **rango de vigencia**. No es purismo: cambian
por norma varias veces al año, y recalcular la planilla de hace seis meses exige
las tasas que regían *entonces*. Una constante en el código haría que reprocesar
el pasado diera cifras distintas a las que realmente se pagaron — exactamente lo
que una fiscalización detecta.

Por el mismo motivo, `EmployeeRepository.activeAt(date)` no filtra por
`status = ACTIVO`: incluye a quien ya cesó pero trabajó ese mes y excluye a quien
ingresó después. El estado actual no sirve para reconstruir el pasado.

### Trazabilidad del cálculo

Toda boleta incluye un `breakdown` con cada paso intermedio: sueldo diario, valor
hora, base de cada descuento, proyección anual de renta, tramos aplicados. No es
decoración: cuando un trabajador reclama su boleta o SUNAFIL pide el sustento,
hay que poder mostrar de dónde sale cada cifra. Una boleta que solo muestra el
neto no se puede defender.

### Decisiones de cálculo, explícitas

- **EsSalud nunca se calcula sobre una base menor a la RMV**, aunque la
  remuneración lo sea. Es una regla del régimen, no una decisión del sistema.
- **La prima del seguro de AFP tiene tope**; el aporte al fondo no.
- **La renta de quinta se calcula sobre el ingreso sin descontar pensiones**: el
  aporte previsional no es deducible de quinta.
- **Un trabajador sin tasas de pensión cargadas queda FUERA del cálculo, con
  aviso.** Inventar una tasa produciría una boleta con cifras falsas.
- **Un contrato de locación de servicios no entra en la planilla**: sus
  honorarios son renta de cuarta categoría.

---

## 11. Índices añadidos en las fases 2 y 3

| Índice | Consulta que sostiene |
|---|---|
| `tax_documents(clientId, kind, docType, serie, number)` **único** | Deduplicación al digitar y al importar |
| `tax_documents(clientId, period, kind)` | Armado de los libros de ventas y compras |
| `journal_entries(clientId, period, number)` **único** | Correlativo del periodo |
| `journal_lines(accountCode)` | Mayor y balance de comprobación |
| `accounting_periods(clientId, period)` **único** | Verificación de periodo abierto en cada escritura |
| `payroll_runs(clientId, period)` **único** | Una planilla por periodo |
| `payroll_items(runId, employeeId)` **único** | Una boleta por trabajador y periodo |
| `pension_rates(system, validFrom)` | Tasas vigentes a una fecha |

El balance de comprobación se agrega **en SQL**, no en memoria: un ejercicio
completo puede tener cientos de miles de líneas y traerlas todas para sumarlas en
JavaScript es justamente lo que no hay que hacer.
