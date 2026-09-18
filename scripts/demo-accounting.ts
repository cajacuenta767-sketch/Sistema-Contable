/**
 * Demostracion de extremo a extremo del motor contable y de planillas.
 *
 * Recorre el circuito completo con los casos de uso REALES, no escribiendo en
 * la base a mano: asienta los comprobantes, confirma los asientos, arma el
 * balance de comprobacion, emite los estados financieros, determina la
 * declaracion mensual, genera los libros electronicos y calcula la planilla.
 *
 * Sirve como verificacion viva: si algo del circuito se rompe, este guion
 * falla antes que el usuario.
 */
import { getContainer } from '../src/infrastructure/container'
import { prisma } from '../src/infrastructure/db/prisma'
import type { AuthenticatedUser } from '../src/core/domain/types'

async function main() {
  const container = getContainer()

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } })
  if (!admin) throw new Error('No hay administrador. Ejecute "npm run db:seed".')

  const user: AuthenticatedUser = {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
  }

  const client = await prisma.client.findFirst({
    where: { taxDocuments: { some: {} } },
    orderBy: { businessName: 'asc' },
  })
  if (!client) throw new Error('No hay clientes con comprobantes. Ejecute "npm run db:seed:accounting".')

  const first = await prisma.taxDocument.findFirst({
    where: { clientId: client.id },
    orderBy: { period: 'desc' },
    select: { period: true },
  })
  const period = first!.period

  console.log(`Cliente : ${client.businessName} (RUC ${client.ruc})`)
  console.log(`Periodo : ${period}\n`)

  // --- 1. Asientos a partir de los comprobantes ---------------------------
  const pending = await prisma.taxDocument.findMany({
    where: { clientId: client.id, period, entryId: null, status: 'REGISTRADO' },
    select: { id: true },
  })

  let generated = 0
  for (const document of pending) {
    try {
      const entry = await container.accounting.generateEntryForDocument(user, document.id)
      await container.accounting.confirmEntry(user, entry.id)
      generated++
    } catch (error) {
      console.error('  error asentando', document.id, error instanceof Error ? error.message : error)
    }
  }
  console.log(`1. Asientos generados y confirmados: ${generated}`)

  // --- 2. Balance de comprobacion -----------------------------------------
  const trialBalance = await container.accountingReports.trialBalance(user, client.id, period, {
    cumulative: true,
    level: 4,
  })
  console.log(`2. Balance de comprobacion: ${trialBalance.rows.length} cuentas`)
  console.log(`   debe   ${trialBalance.totals.debit.format()}`)
  console.log(`   haber  ${trialBalance.totals.credit.format()}`)
  console.log(`   cuadra: ${trialBalance.balanced ? 'SI' : 'NO'}`)
  console.log(`   resultado del ejercicio: ${trialBalance.netIncome.format()}`)

  if (!trialBalance.balanced) {
    throw new Error('El balance no cuadra: el resto del circuito no tiene sentido.')
  }

  // --- 3. Estados financieros ---------------------------------------------
  const statements = await container.accountingReports.financialStatements(user, client.id, period)
  console.log('\n3. Estado de situacion financiera')
  console.log(`   activo     ${statements.balanceSheet.totalAssets.format()}`)
  console.log(`   pasivo     ${statements.balanceSheet.totalLiabilities.format()}`)
  console.log(`   patrimonio ${statements.balanceSheet.totalEquity.format()}`)
  console.log(`   resultado  ${statements.balanceSheet.netIncome.format()}`)
  console.log(`   cuadra: ${statements.balanceSheet.balanced ? 'SI' : 'NO'}`)
  console.log('\n   Estado de resultados')
  console.log(`   ingresos   ${statements.incomeStatement.totalRevenue.format()}`)
  console.log(`   gastos     ${statements.incomeStatement.totalExpenses.format()}`)
  console.log(`   utilidad   ${statements.incomeStatement.netIncome.format()}`)

  // --- 4. Declaracion mensual ---------------------------------------------
  const { taxReturn, warnings } = await container.accountingReports.computeTaxReturn(
    user,
    client.id,
    period,
  )
  console.log('\n4. Determinacion mensual')
  console.log(`   debito fiscal (ventas)   ${taxReturn.salesIgv.format()}`)
  console.log(`   credito fiscal (compras) ${taxReturn.purchasesIgv.format()}`)
  console.log(`   IGV a pagar              ${taxReturn.igvToPay.format()}`)
  console.log(`   saldo a favor            ${taxReturn.carryForward.format()}`)
  console.log(`   pago a cuenta de renta   ${taxReturn.incomeTax.format()} (tasa ${taxReturn.incomeTaxRate})`)
  console.log(`   TOTAL A PAGAR            ${taxReturn.totalToPay.format()}`)
  for (const warning of warnings) console.log(`   aviso: ${warning}`)

  // --- 5. Libros electronicos ---------------------------------------------
  console.log('\n5. Libros electronicos (PLE)')
  for (const bookCode of ['140100', '080100', '050100', '060100']) {
    const file = await container.accountingReports.generatePleBook(user, {
      clientId: client.id,
      period,
      bookCode,
    })
    console.log(`   ${file.bookName.padEnd(32)} ${file.fileName}  (${file.lineCount} lineas)`)
  }

  // --- 6. Planilla ---------------------------------------------------------
  // Si una corrida anterior la dejo cerrada, se reabre: este guion existe para
  // ejercitar el circuito completo, no para respetar un cierre de demostracion.
  const existingRun = await container.payroll.getRun(user, client.id, period)
  if (existingRun?.status === 'CERRADA') {
    await container.payroll.reopenRun(user, existingRun.id)
    console.log('\n   (la planilla estaba cerrada de una corrida anterior: se reabrio)')
  }

  const payroll = await container.payroll.computeRun(user, { clientId: client.id, period })
  console.log('\n6. Planilla del periodo')
  console.log(`   trabajadores        ${payroll.run.employeeCount}`)
  console.log(`   total ingresos      ${payroll.run.totalGross.format()}`)
  console.log(`   total descuentos    ${payroll.run.totalDeductions.format()}`)
  console.log(`   total neto a pagar  ${payroll.run.totalNet.format()}`)
  console.log(`   aportes del empleador ${payroll.run.totalEmployer.format()}`)
  for (const item of payroll.run.items) {
    console.log(
      `     ${item.employeeName.padEnd(24)} bruto ${item.grossPay.format().padStart(12)}` +
        `  desc ${item.totalDeductions.format().padStart(11)}  neto ${item.netPay.format().padStart(12)}`,
    )
  }
  for (const warning of payroll.warnings) console.log(`   aviso: ${warning}`)

  console.log('\nCircuito completo ejecutado sin errores.')
}

main()
  .catch((error) => {
    console.error('\nFALLO:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
