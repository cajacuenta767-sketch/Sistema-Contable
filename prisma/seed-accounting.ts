/**
 * Siembra de las fases 2 y 3: plan contable, parametros normativos, tasas de
 * pension, comprobantes de ejemplo, asientos, trabajadores y planilla.
 *
 * ADVERTENCIA SOBRE LAS CIFRAS NORMATIVAS
 * ---------------------------------------
 * La UIT, la remuneracion minima, las tasas de EsSalud y SCTR y las comisiones
 * de las AFP que se cargan aqui son VALORES DE REFERENCIA para poder probar el
 * sistema. Cambian por norma y deben verificarse contra la disposicion vigente
 * antes de usarlos para calcular una planilla real. El sistema los lee de la
 * base justamente para que actualizarlos no exija tocar codigo.
 */
import { PrismaClient, Prisma } from '@prisma/client'
import { buildPcgeRows } from '../src/infrastructure/data/pcge'

const prisma = new PrismaClient()

const D = (value: string) => new Prisma.Decimal(value)

/** Redondeo comercial a dos decimales, para armar los comprobantes de ejemplo. */
function round2(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2)
}

async function main() {
  console.log('Sembrando contabilidad y planillas...\n')

  // --- Plan Contable General Empresarial ---------------------------------
  const accounts = buildPcgeRows()
  const chart = await prisma.account.createMany({
    data: accounts.map((a) => ({ ...a, clientId: null })),
    skipDuplicates: true,
  })
  console.log(`  plan contable: ${chart.count} cuentas nuevas (${accounts.length} en el catalogo)`)

  // --- Parametros del ejercicio ------------------------------------------
  // Escala de renta de quinta categoria: tramos acumulativos en UIT.
  const brackets = [
    { upToUit: 5, rate: '0.08' },
    { upToUit: 20, rate: '0.14' },
    { upToUit: 35, rate: '0.17' },
    { upToUit: 45, rate: '0.20' },
    { upToUit: null, rate: '0.30' },
  ]

  for (const year of [2025, 2026]) {
    await prisma.taxParameter.upsert({
      where: { year },
      update: {},
      create: {
        year,
        uit: D(year === 2026 ? '5350.00' : '5150.00'),
        minimumWage: D(year === 2026 ? '1130.00' : '1025.00'),
        essaludRate: D('0.09'),
        sctrRate: D('0.0153'),
        igvRate: D('0.18'),
        incomeTaxBrackets: brackets,
      },
    })
  }
  console.log('  parametros de 2025 y 2026 (VALORES DE REFERENCIA: verificar antes de usar)')

  // --- Tasas de pension ---------------------------------------------------
  const validFrom = new Date(Date.UTC(2025, 0, 1))
  const pensionRates = [
    { system: 'ONP' as const, afpCode: null, afpName: null, contributionRate: '0.13', commissionFlowRate: null, commissionMixedRate: null, insuranceRate: null, insuranceCap: null },
    { system: 'AFP' as const, afpCode: 'INTEGRA', afpName: 'AFP Integra', contributionRate: '0.10', commissionFlowRate: '0.0155', commissionMixedRate: '0.0000', insuranceRate: '0.0174', insuranceCap: '12000.00' },
    { system: 'AFP' as const, afpCode: 'PRIMA', afpName: 'Prima AFP', contributionRate: '0.10', commissionFlowRate: '0.0160', commissionMixedRate: '0.0000', insuranceRate: '0.0174', insuranceCap: '12000.00' },
    { system: 'AFP' as const, afpCode: 'PROFUTURO', afpName: 'Profuturo AFP', contributionRate: '0.10', commissionFlowRate: '0.0169', commissionMixedRate: '0.0000', insuranceRate: '0.0174', insuranceCap: '12000.00' },
    { system: 'AFP' as const, afpCode: 'HABITAT', afpName: 'AFP Habitat', contributionRate: '0.10', commissionFlowRate: '0.0147', commissionMixedRate: '0.0000', insuranceRate: '0.0174', insuranceCap: '12000.00' },
  ]

  for (const rate of pensionRates) {
    const existing = await prisma.pensionRate.findFirst({
      where: { system: rate.system, afpCode: rate.afpCode, validFrom },
    })
    if (existing) continue
    await prisma.pensionRate.create({
      data: {
        system: rate.system,
        afpCode: rate.afpCode,
        afpName: rate.afpName,
        validFrom,
        contributionRate: D(rate.contributionRate),
        commissionFlowRate: rate.commissionFlowRate ? D(rate.commissionFlowRate) : null,
        commissionMixedRate: rate.commissionMixedRate ? D(rate.commissionMixedRate) : null,
        insuranceRate: rate.insuranceRate ? D(rate.insuranceRate) : null,
        insuranceCap: rate.insuranceCap ? D(rate.insuranceCap) : null,
      },
    })
  }
  console.log(`  tasas de pension: ONP y ${pensionRates.length - 1} AFP (REFERENCIA)`)

  // --- Datos de ejemplo para los tres primeros clientes -------------------
  const clients = await prisma.client.findMany({
    where: { status: 'ACTIVE', taxRegime: { in: ['GENERAL', 'MYPE'] } },
    orderBy: { businessName: 'asc' },
    take: 3,
    select: { id: true, ruc: true, businessName: true },
  })

  if (clients.length === 0) {
    console.log('\n  No hay clientes. Ejecute primero "npm run db:seed".')
    return
  }

  const now = new Date()
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth()).padStart(2, '0')}`
  const [year, month] = period.split('-').map(Number)

  let totalDocs = 0
  for (const [clientIndex, client] of clients.entries()) {
    await prisma.accountingPeriod.upsert({
      where: { clientId_period: { clientId: client.id, period } },
      update: {},
      create: { clientId: client.id, period, status: 'ABIERTO' },
    })

    const documents: Prisma.TaxDocumentCreateManyInput[] = []

    // Ventas
    for (let i = 1; i <= 12; i++) {
      const base = 850 + i * 137 + clientIndex * 90
      const igv = base * 0.18
      documents.push({
        clientId: client.id,
        kind: 'VENTA',
        docType: i % 5 === 0 ? '03' : '01',
        serie: i % 5 === 0 ? 'B001' : 'F001',
        number: String(100 + i),
        issueDate: new Date(Date.UTC(year!, month! - 1, Math.min(28, i * 2), 12)),
        period,
        counterpartyDocType: i % 5 === 0 ? '1' : '6',
        counterpartyDocNumber: i % 5 === 0 ? '45678912' : `2060${String(1000000 + i * 37).slice(0, 7)}`,
        counterpartyName: i % 5 === 0 ? 'Cliente Persona Natural' : `Comprador ${i} S.A.C.`,
        currency: 'PEN',
        exchangeRate: D('1'),
        taxableBase: D(round2(base)),
        igv: D(round2(igv)),
        total: D(round2(base + igv)),
      })
    }

    // Compras
    for (let i = 1; i <= 9; i++) {
      const base = 400 + i * 96 + clientIndex * 55
      const igv = base * 0.18
      documents.push({
        clientId: client.id,
        kind: 'COMPRA',
        docType: '01',
        serie: `F${String(100 + i).slice(0, 3)}`,
        number: String(2000 + i),
        issueDate: new Date(Date.UTC(year!, month! - 1, Math.min(28, i * 3), 12)),
        period,
        counterpartyDocType: '6',
        counterpartyDocNumber: `2010${String(2000000 + i * 91).slice(0, 7)}`,
        counterpartyName: `Proveedor ${i} E.I.R.L.`,
        currency: 'PEN',
        exchangeRate: D('1'),
        taxableBase: D(round2(base)),
        igv: D(round2(igv)),
        total: D(round2(base + igv)),
      })
    }

    const inserted = await prisma.taxDocument.createMany({ data: documents, skipDuplicates: true })
    totalDocs += inserted.count

    // --- Trabajadores ----------------------------------------------------
    const employees = [
      { docNumber: `4${String(1000000 + clientIndex * 11).slice(0, 7)}`, firstName: 'Rosa', lastName: 'Huaman Vega', position: 'Administradora', basicSalary: '4200.00', pensionSystem: 'AFP' as const, afpCode: 'INTEGRA', familyAllowance: true, highRisk: false },
      { docNumber: `4${String(2000000 + clientIndex * 11).slice(0, 7)}`, firstName: 'Pedro', lastName: 'Castillo Rojas', position: 'Operario', basicSalary: '1500.00', pensionSystem: 'ONP' as const, afpCode: null, familyAllowance: false, highRisk: true },
      { docNumber: `4${String(3000000 + clientIndex * 11).slice(0, 7)}`, firstName: 'Lucia', lastName: 'Mendoza Paredes', position: 'Contadora', basicSalary: '8500.00', pensionSystem: 'AFP' as const, afpCode: 'PRIMA', familyAllowance: true, highRisk: false },
    ]

    for (const employee of employees) {
      await prisma.employee.upsert({
        where: { clientId_docNumber: { clientId: client.id, docNumber: employee.docNumber } },
        update: {},
        create: {
          clientId: client.id,
          docType: '1',
          docNumber: employee.docNumber,
          firstName: employee.firstName,
          lastName: employee.lastName,
          position: employee.position,
          contractType: 'INDEFINIDO',
          // Mediodia UTC: una fecha de calendario no debe moverse de dia al
          // mostrarse en Lima. Ver la nota en src/lib/validation.ts.
          hireDate: new Date(Date.UTC(2024, clientIndex, 1, 12)),
          basicSalary: D(employee.basicSalary),
          familyAllowance: employee.familyAllowance,
          pensionSystem: employee.pensionSystem,
          afpCode: employee.afpCode,
          commissionType: 'FLUJO',
          healthSystem: 'ESSALUD',
          highRisk: employee.highRisk,
        },
      })
    }
  }

  console.log(`\n  ${clients.length} clientes con contabilidad de ejemplo`)
  console.log(`  ${totalDocs} comprobantes del periodo ${period}`)
  console.log(`  3 trabajadores por cliente`)
  console.log('\nSiguiente paso: "npm run demo:accounting" genera los asientos y la planilla.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
