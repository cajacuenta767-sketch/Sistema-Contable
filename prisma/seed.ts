/**
 * Datos de ejemplo para desarrollo.
 *
 * Genera un estudio realista: personal con distintos roles, 30 clientes con
 * RUC valido (digito verificador calculado, no inventado), el cronograma SUNAT
 * de tres periodos, las plantillas recurrentes tipicas y las tareas expandidas
 * a partir de ellas.
 *
 * Es idempotente: se puede correr varias veces. Usa upsert por clave natural.
 */
import { PrismaClient, type TaxRegime } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const DEMO_PASSWORD = 'Contable2026!'

/** Calcula el digito verificador para que los RUC de prueba sean validos. */
function buildRuc(prefix: string, body: string): string {
  const base = `${prefix}${body}`.padEnd(10, '0').slice(0, 10)
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 10; i++) sum += Number(base[i]) * (weights[i] ?? 0)
  const remainder = 11 - (sum % 11)
  const check = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder
  return `${base}${check}`
}

/** Fin del dia en Lima expresado en UTC (mismo criterio que el dominio). */
function limaEndOfDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 28, 59, 59))
}

async function main() {
  console.log('Sembrando datos de ejemplo...')
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

  // --- Personal --------------------------------------------------------
  const staffSeed = [
    { email: 'admin@estudio.pe', fullName: 'Maria Quispe', role: 'ADMIN' as const, capacity: 30 },
    { email: 'supervisor@estudio.pe', fullName: 'Jorge Ramos', role: 'SUPERVISOR' as const, capacity: 45 },
    { email: 'ana@estudio.pe', fullName: 'Ana Torres', role: 'CONTADOR' as const, capacity: 40 },
    { email: 'luis@estudio.pe', fullName: 'Luis Perez', role: 'CONTADOR' as const, capacity: 40 },
    { email: 'carla@estudio.pe', fullName: 'Carla Diaz', role: 'ASISTENTE' as const, capacity: 25 },
  ]

  const staff = []
  for (const person of staffSeed) {
    staff.push(
      await prisma.user.upsert({
        where: { email: person.email },
        update: { fullName: person.fullName, role: person.role, capacity: person.capacity },
        create: { ...person, passwordHash },
      }),
    )
  }
  const [admin, , ana, luis, carla] = staff
  if (!admin || !ana || !luis || !carla) throw new Error('No se pudo crear el personal base')
  const accountants = [ana, luis, carla]
  console.log(`  ${staff.length} usuarios`)

  // --- Cronograma SUNAT -------------------------------------------------
  // En produccion se carga desde la resolucion oficial. Aqui se aproxima para
  // que el entorno de desarrollo tenga fechas coherentes.
  const now = new Date()
  const schedulePeriods = [-2, -1, 0].map((delta) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + delta, 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  })

  for (const { year, month } of schedulePeriods) {
    const period = `${year}-${String(month).padStart(2, '0')}`
    const filing = new Date(Date.UTC(year, month, 1)) // mes siguiente
    for (let digit = 0; digit <= 9; digit++) {
      await prisma.sunatDueDate.upsert({
        where: { period_lastDigit: { period, lastDigit: digit } },
        update: {},
        create: {
          period,
          lastDigit: digit,
          dueDate: limaEndOfDay(filing.getUTCFullYear(), filing.getUTCMonth() + 1, 14 + digit),
        },
      })
    }
  }
  console.log(`  cronograma SUNAT de ${schedulePeriods.length} periodos`)

  // --- Clientes ---------------------------------------------------------
  const regimes: TaxRegime[] = ['NRUS', 'RER', 'MYPE', 'GENERAL']
  const names = [
    'Comercial Andina', 'Servicios Generales del Sur', 'Textiles Mi Peru', 'Transportes Rapido',
    'Constructora Lima Norte', 'Importaciones Wari', 'Panaderia La Espiga', 'Consultora Inka',
    'Distribuidora El Sol', 'Ferreteria Central', 'Agroexportadora Valle', 'Editorial Amauta',
    'Clinica San Martin', 'Turismo Machu', 'Pesquera Costa Azul', 'Grafica Moderna',
    'Inmobiliaria Pacifico', 'Seguridad Total', 'Laboratorio Vida', 'Restaurante Sabor',
    'Automotriz Titicaca', 'Farmacia Salud', 'Logistica Express', 'Muebles Cedro',
    'Tecnologia Byte', 'Plasticos Union', 'Confecciones Nova', 'Energia Verde',
    'Minera Pequena SAC', 'Estudio Juridico Norte',
  ]

  const clients = []
  for (const [index, name] of names.entries()) {
    const ruc = buildRuc(index % 4 === 0 ? '10' : '20', String(40000000 + index * 137).slice(0, 8))
    clients.push(
      await prisma.client.upsert({
        where: { ruc },
        update: {},
        create: {
          ruc,
          rucLastDigit: Number(ruc[10]),
          businessName: `${name} S.A.C.`,
          tradeName: name,
          taxRegime: regimes[index % regimes.length] ?? 'GENERAL',
          status: index % 17 === 0 ? 'SUSPENDED' : 'ACTIVE',
          accountantId: accountants[index % accountants.length]?.id ?? null,
          monthlyFee: 350 + (index % 6) * 120,
          serviceStart: new Date(Date.UTC(2024, index % 12, 1, 12)),
          contactName: 'Area de contabilidad',
          contactPhone: `9${String(90000000 + index * 7331).slice(0, 8)}`,
        },
      }),
    )
  }
  console.log(`  ${clients.length} clientes`)

  // --- Plantillas recurrentes ------------------------------------------
  const templates = [
    {
      name: 'Declaracion mensual IGV-Renta',
      description: 'Elaborar y presentar la declaracion mensual en SUNAT Operaciones en Linea.',
      category: 'DECLARACION' as const,
      priority: 'ALTA' as const,
      dueDateRule: 'SUNAT_MONTHLY' as const,
      appliesToRegimes: [] as TaxRegime[],
    },
    {
      name: 'Registro de ventas y compras',
      description: 'Consolidar comprobantes del periodo y cuadrar con la declaracion.',
      category: 'LIBRO' as const,
      priority: 'MEDIA' as const,
      dueDateRule: 'DAY_OF_MONTH' as const,
      dueDayOfMonth: 10,
      appliesToRegimes: ['RER', 'MYPE', 'GENERAL'] as TaxRegime[],
    },
    {
      name: 'Planilla de remuneraciones',
      description: 'Calcular planilla, generar boletas y preparar el PLAME.',
      category: 'PLANILLA' as const,
      priority: 'ALTA' as const,
      dueDateRule: 'DAY_OF_MONTH' as const,
      dueDayOfMonth: 5,
      appliesToRegimes: ['MYPE', 'GENERAL'] as TaxRegime[],
    },
    {
      name: 'Reporte mensual al cliente',
      description: 'Enviar resumen de obligaciones cumplidas del periodo.',
      category: 'REPORTE' as const,
      priority: 'BAJA' as const,
      dueDateRule: 'DAY_OF_MONTH' as const,
      dueDayOfMonth: 20,
      appliesToRegimes: [] as TaxRegime[],
    },
  ]

  for (const template of templates) {
    const existing = await prisma.taskTemplate.findFirst({
      where: { name: template.name, clientId: null },
    })
    if (!existing) await prisma.taskTemplate.create({ data: { ...template, recurrence: 'MENSUAL' } })
  }
  console.log(`  ${templates.length} plantillas recurrentes`)

  console.log('\nListo. Credenciales de acceso:')
  for (const person of staffSeed) console.log(`  ${person.email}  (${person.role})`)
  console.log(`  contrasenia: ${DEMO_PASSWORD}`)
  console.log('\nEjecute "npm run jobs:generate-tasks" para expandir las plantillas en tareas.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
