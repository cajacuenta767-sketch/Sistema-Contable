/** Inspeccion rapida de un libro generado. Util para revisar el formato. */
import { getContainer } from '../src/infrastructure/container'
import { prisma } from '../src/infrastructure/db/prisma'
import { PleGenerator } from '../src/core/domain/accounting/ple/generator'

async function main() {
  const container = getContainer()
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  const client = await prisma.client.findFirst({
    where: { taxDocuments: { some: {} } },
    orderBy: { businessName: 'asc' },
  })
  const document = await prisma.taxDocument.findFirst({
    where: { clientId: client!.id },
    select: { period: true },
  })

  const user = {
    id: admin!.id,
    email: admin!.email,
    fullName: admin!.fullName,
    role: admin!.role,
  }
  const period = document!.period

  for (const bookCode of ['140100', '050100']) {
    const file = await container.accountingReports.generatePleBook(user, {
      clientId: client!.id,
      period,
      bookCode,
    })
    console.log(`=== ${file.bookName} :: ${file.fileName} ===`)
    console.log(file.content.split('\r\n').slice(0, 3).join('\n'))
    console.log(`... ${file.lineCount} lineas`)
    if (file.totals) console.log(`totales de control: debe=${file.totals.debit} haber=${file.totals.credit}`)
    console.log(`bytes en Latin-1: ${PleGenerator.toBuffer(file.content).length}`)
    console.log()
  }

  const exports_ = await container.accountingReports.listPleExports(user, client!.id, period)
  console.log(`constancias registradas: ${exports_.length}`)
  console.log(`ultimo checksum: ${exports_[0]?.checksum?.slice(0, 24)}...`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); process.exit(0) })
