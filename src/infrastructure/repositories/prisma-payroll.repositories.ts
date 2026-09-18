import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  CreateEmployeeInput,
  EmployeeRecord,
  EmployeeRepository,
  PayrollItemRecord,
  PayrollRunRecord,
  PayrollRunRepository,
  PensionRateRepository,
  TaxParameterRecord,
  TaxParameterRepository,
} from '@/core/application/ports/payroll'
import type { IncomeTaxBracket, PensionParameters } from '@/core/domain/payroll/parameters'
import { Money } from '@/core/domain/value-objects/money'
import { ConflictError } from '@/core/domain/errors'
import { rateToString, toDecimal, toMoney, toMoneyOrNull } from './money-mapper'

// ---------------------------------------------------------------------------
// Trabajadores
// ---------------------------------------------------------------------------

type EmployeeRow = Prisma.EmployeeGetPayload<object>

function toEmployeeRecord(row: EmployeeRow): EmployeeRecord {
  return {
    id: row.id,
    docType: row.docType,
    docNumber: row.docNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`.trim(),
    position: row.position,
    status: row.status,
    contractType: row.contractType,
    hireDate: row.hireDate,
    terminationDate: row.terminationDate,
    basicSalary: toMoney(row.basicSalary),
    familyAllowance: row.familyAllowance,
    pensionSystem: row.pensionSystem,
    afpCode: row.afpCode,
    afpCuspp: row.afpCuspp,
    commissionType: row.commissionType,
    healthSystem: row.healthSystem,
    highRisk: row.highRisk,
    bankAccount: row.bankAccount,
    clientId: row.clientId,
  }
}

function toEmployeeData(input: Partial<CreateEmployeeInput>) {
  const data: Prisma.EmployeeUncheckedUpdateInput = {}
  if (input.docType !== undefined) data.docType = input.docType
  if (input.docNumber !== undefined) data.docNumber = input.docNumber
  if (input.firstName !== undefined) data.firstName = input.firstName
  if (input.lastName !== undefined) data.lastName = input.lastName
  if (input.position !== undefined) data.position = input.position
  if (input.status !== undefined) data.status = input.status
  if (input.contractType !== undefined) data.contractType = input.contractType
  if (input.hireDate !== undefined) data.hireDate = input.hireDate
  if (input.terminationDate !== undefined) data.terminationDate = input.terminationDate
  if (input.basicSalary !== undefined) data.basicSalary = toDecimal(input.basicSalary)
  if (input.familyAllowance !== undefined) data.familyAllowance = input.familyAllowance
  if (input.pensionSystem !== undefined) data.pensionSystem = input.pensionSystem
  if (input.afpCode !== undefined) data.afpCode = input.afpCode
  if (input.afpCuspp !== undefined) data.afpCuspp = input.afpCuspp
  if (input.commissionType !== undefined) data.commissionType = input.commissionType
  if (input.healthSystem !== undefined) data.healthSystem = input.healthSystem
  if (input.highRisk !== undefined) data.highRisk = input.highRisk
  if (input.bankAccount !== undefined) data.bankAccount = input.bankAccount
  if (input.clientId !== undefined) data.clientId = input.clientId
  return data
}

export class PrismaEmployeeRepository implements EmployeeRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(clientId: string, includeTerminated: boolean): Promise<EmployeeRecord[]> {
    const rows = await this.db.employee.findMany({
      where: { clientId, ...(includeTerminated ? {} : { status: 'ACTIVO' }) },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    return rows.map(toEmployeeRecord)
  }

  async findById(id: string): Promise<EmployeeRecord | null> {
    const row = await this.db.employee.findUnique({ where: { id } })
    return row ? toEmployeeRecord(row) : null
  }

  async create(input: CreateEmployeeInput): Promise<EmployeeRecord> {
    try {
      const row = await this.db.employee.create({
        data: toEmployeeData(input) as Prisma.EmployeeUncheckedCreateInput,
      })
      return toEmployeeRecord(row)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(
          `Ya existe un trabajador con el documento ${input.docNumber} en esta empresa`,
        )
      }
      throw error
    }
  }

  async update(id: string, input: Partial<CreateEmployeeInput>): Promise<EmployeeRecord> {
    const row = await this.db.employee.update({ where: { id }, data: toEmployeeData(input) })
    return toEmployeeRecord(row)
  }

  /**
   * Activos a una fecha.
   *
   * No basta con `status = ACTIVO`: para recalcular la planilla de un mes
   * pasado hay que incluir a quien ya ceso pero trabajo ese mes, y excluir a
   * quien ingreso despues. El estado actual no sirve para reconstruir el
   * pasado.
   */
  async activeAt(clientId: string, date: Date): Promise<EmployeeRecord[]> {
    const rows = await this.db.employee.findMany({
      where: {
        clientId,
        hireDate: { lte: date },
        OR: [{ terminationDate: null }, { terminationDate: { gte: date } }],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    return rows.map(toEmployeeRecord)
  }
}

// ---------------------------------------------------------------------------
// Planillas
// ---------------------------------------------------------------------------

const RUN_FIELDS = {
  id: true, period: true, status: true,
  totalGross: true, totalDeductions: true, totalNet: true, totalEmployer: true,
  employeeCount: true, closedAt: true, clientId: true, createdAt: true,
  items: {
    orderBy: { employee: { lastName: 'asc' } },
    select: {
      id: true, employeeId: true, workedDays: true, absentDays: true, overtimeHours: true,
      basicPay: true, familyAllowance: true, overtimePay: true, bonuses: true, grossPay: true,
      pensionContribution: true, pensionCommission: true, pensionInsurance: true,
      incomeTax5th: true, otherDeductions: true, totalDeductions: true, netPay: true,
      employerEssalud: true, employerSctr: true, employerTotal: true, breakdown: true,
      employee: { select: { firstName: true, lastName: true, docNumber: true } },
    },
  },
} as const

type RunRow = Prisma.PayrollRunGetPayload<{ select: typeof RUN_FIELDS }>

function toRunRecord(row: RunRow): PayrollRunRecord {
  return {
    id: row.id,
    period: row.period,
    status: row.status,
    totalGross: toMoney(row.totalGross),
    totalDeductions: toMoney(row.totalDeductions),
    totalNet: toMoney(row.totalNet),
    totalEmployer: toMoney(row.totalEmployer),
    employeeCount: row.employeeCount,
    closedAt: row.closedAt,
    clientId: row.clientId,
    createdAt: row.createdAt,
    items: row.items.map(
      (item): PayrollItemRecord => ({
        id: item.id,
        employeeId: item.employeeId,
        employeeName: `${item.employee.firstName} ${item.employee.lastName}`.trim(),
        employeeDocNumber: item.employee.docNumber,
        workedDays: item.workedDays,
        absentDays: item.absentDays,
        overtimeHours: Number(item.overtimeHours),
        basicPay: toMoney(item.basicPay),
        familyAllowance: toMoney(item.familyAllowance),
        overtimePay: toMoney(item.overtimePay),
        bonuses: toMoney(item.bonuses),
        grossPay: toMoney(item.grossPay),
        pensionContribution: toMoney(item.pensionContribution),
        pensionCommission: toMoney(item.pensionCommission),
        pensionInsurance: toMoney(item.pensionInsurance),
        incomeTax5th: toMoney(item.incomeTax5th),
        otherDeductions: toMoney(item.otherDeductions),
        totalDeductions: toMoney(item.totalDeductions),
        netPay: toMoney(item.netPay),
        employerEssalud: toMoney(item.employerEssalud),
        employerSctr: toMoney(item.employerSctr),
        employerTotal: toMoney(item.employerTotal),
        breakdown: (item.breakdown as Record<string, string> | null) ?? null,
      }),
    ),
  }
}

export class PrismaPayrollRunRepository implements PayrollRunRepository {
  constructor(private readonly db: PrismaClient) {}

  async find(clientId: string, period: string): Promise<PayrollRunRecord | null> {
    const row = await this.db.payrollRun.findUnique({
      where: { clientId_period: { clientId, period } },
      select: RUN_FIELDS,
    })
    return row ? toRunRecord(row) : null
  }

  async findById(id: string): Promise<PayrollRunRecord | null> {
    const row = await this.db.payrollRun.findUnique({ where: { id }, select: RUN_FIELDS })
    return row ? toRunRecord(row) : null
  }

  async list(clientId: string, limit: number) {
    const rows = await this.db.payrollRun.findMany({
      where: { clientId },
      orderBy: { period: 'desc' },
      take: limit,
    })
    return rows.map((row) => ({
      id: row.id,
      period: row.period,
      status: row.status,
      totalGross: toMoney(row.totalGross),
      totalDeductions: toMoney(row.totalDeductions),
      totalNet: toMoney(row.totalNet),
      totalEmployer: toMoney(row.totalEmployer),
      employeeCount: row.employeeCount,
      closedAt: row.closedAt,
      clientId: row.clientId,
      createdAt: row.createdAt,
    }))
  }

  /**
   * Guarda el calculo completo del periodo.
   *
   * Recalcular reemplaza el detalle anterior en una sola transaccion: dejar
   * boletas viejas mezcladas con nuevas daria totales que no corresponden a
   * ninguna version del calculo. Una planilla CERRADA no se toca.
   */
  async save(input: {
    clientId: string
    period: string
    createdById: string | null
    items: Omit<PayrollItemRecord, 'id' | 'employeeName' | 'employeeDocNumber'>[]
  }): Promise<PayrollRunRecord> {
    const totals = input.items.reduce(
      (acc, item) => ({
        gross: acc.gross.add(item.grossPay),
        deductions: acc.deductions.add(item.totalDeductions),
        net: acc.net.add(item.netPay),
        employer: acc.employer.add(item.employerTotal),
      }),
      { gross: Money.zero(), deductions: Money.zero(), net: Money.zero(), employer: Money.zero() },
    )

    const runId = await this.db.$transaction(async (tx) => {
      const existing = await tx.payrollRun.findUnique({
        where: { clientId_period: { clientId: input.clientId, period: input.period } },
        select: { id: true, status: true },
      })

      if (existing?.status === 'CERRADA') {
        throw new ConflictError(
          `La planilla de ${input.period} esta cerrada y no puede recalcularse. ` +
            'Reabrala primero si necesita corregirla.',
        )
      }

      const run = existing
        ? await tx.payrollRun.update({
            where: { id: existing.id },
            data: {
              totalGross: toDecimal(totals.gross),
              totalDeductions: toDecimal(totals.deductions),
              totalNet: toDecimal(totals.net),
              totalEmployer: toDecimal(totals.employer),
              employeeCount: input.items.length,
            },
            select: { id: true },
          })
        : await tx.payrollRun.create({
            data: {
              clientId: input.clientId,
              period: input.period,
              createdById: input.createdById,
              totalGross: toDecimal(totals.gross),
              totalDeductions: toDecimal(totals.deductions),
              totalNet: toDecimal(totals.net),
              totalEmployer: toDecimal(totals.employer),
              employeeCount: input.items.length,
            },
            select: { id: true },
          })

      await tx.payrollItem.deleteMany({ where: { runId: run.id } })

      if (input.items.length > 0) {
        await tx.payrollItem.createMany({
          data: input.items.map((item) => ({
            runId: run.id,
            employeeId: item.employeeId,
            workedDays: item.workedDays,
            absentDays: item.absentDays,
            overtimeHours: new Prisma.Decimal(item.overtimeHours),
            basicPay: toDecimal(item.basicPay),
            familyAllowance: toDecimal(item.familyAllowance),
            overtimePay: toDecimal(item.overtimePay),
            bonuses: toDecimal(item.bonuses),
            grossPay: toDecimal(item.grossPay),
            pensionContribution: toDecimal(item.pensionContribution),
            pensionCommission: toDecimal(item.pensionCommission),
            pensionInsurance: toDecimal(item.pensionInsurance),
            incomeTax5th: toDecimal(item.incomeTax5th),
            otherDeductions: toDecimal(item.otherDeductions),
            totalDeductions: toDecimal(item.totalDeductions),
            netPay: toDecimal(item.netPay),
            employerEssalud: toDecimal(item.employerEssalud),
            employerSctr: toDecimal(item.employerSctr),
            employerTotal: toDecimal(item.employerTotal),
            breakdown: (item.breakdown ?? {}) as object,
          })),
        })
      }

      return run.id
    })

    const saved = await this.findById(runId)
    if (!saved) throw new ConflictError('No se pudo recuperar la planilla recien guardada')
    return saved
  }

  async close(id: string, userId: string): Promise<PayrollRunRecord> {
    await this.db.payrollRun.update({
      where: { id },
      data: { status: 'CERRADA', closedAt: new Date(), closedById: userId },
    })
    const closed = await this.findById(id)
    if (!closed) throw new ConflictError('No se pudo recuperar la planilla cerrada')
    return closed
  }

  async reopen(id: string): Promise<PayrollRunRecord> {
    await this.db.payrollRun.update({
      where: { id },
      data: { status: 'BORRADOR', closedAt: null, closedById: null },
    })
    const reopened = await this.findById(id)
    if (!reopened) throw new ConflictError('No se pudo recuperar la planilla reabierta')
    return reopened
  }

  /**
   * Renta de quinta ya retenida en el ejercicio, hasta el mes anterior.
   * Es lo que permite que la retencion del mes no vuelva a cobrar lo cobrado.
   */
  async withheldIncomeTaxToDate(
    employeeId: string,
    year: number,
    upToMonth: number,
  ): Promise<Money> {
    const periods = Array.from({ length: Math.max(0, upToMonth - 1) }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}`,
    )
    if (periods.length === 0) return Money.zero()

    const result = await this.db.payrollItem.aggregate({
      where: { employeeId, run: { period: { in: periods } } },
      _sum: { incomeTax5th: true },
    })
    return toMoney(result._sum.incomeTax5th)
  }
}

// ---------------------------------------------------------------------------
// Parametros normativos
// ---------------------------------------------------------------------------

export class PrismaTaxParameterRepository implements TaxParameterRepository {
  constructor(private readonly db: PrismaClient) {}

  async forYear(year: number): Promise<TaxParameterRecord | null> {
    const row = await this.db.taxParameter.findUnique({ where: { year } })
    if (!row) return null
    return {
      year: row.year,
      uit: toMoney(row.uit),
      minimumWage: toMoney(row.minimumWage),
      essaludRate: rateToString(row.essaludRate),
      sctrRate: rateToString(row.sctrRate),
      igvRate: rateToString(row.igvRate),
      incomeTaxBrackets: row.incomeTaxBrackets as unknown as IncomeTaxBracket[],
    }
  }

  async upsert(input: TaxParameterRecord): Promise<TaxParameterRecord> {
    const data = {
      uit: toDecimal(input.uit),
      minimumWage: toDecimal(input.minimumWage),
      essaludRate: new Prisma.Decimal(input.essaludRate),
      sctrRate: new Prisma.Decimal(input.sctrRate),
      igvRate: new Prisma.Decimal(input.igvRate),
      incomeTaxBrackets: input.incomeTaxBrackets as unknown as object,
    }
    await this.db.taxParameter.upsert({
      where: { year: input.year },
      create: { year: input.year, ...data },
      update: data,
    })
    return input
  }
}

export class PrismaPensionRateRepository implements PensionRateRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Tasas vigentes a una fecha.
   *
   * El filtro por rango de vigencia es lo que permite recalcular una planilla
   * antigua con las tasas que regian entonces. Sin el, reprocesar el pasado
   * daria cifras distintas a las que realmente se pagaron.
   */
  async effectiveAt(date: Date): Promise<Map<string, PensionParameters>> {
    const rows = await this.db.pensionRate.findMany({
      where: { validFrom: { lte: date }, OR: [{ validTo: null }, { validTo: { gte: date } }] },
      orderBy: { validFrom: 'desc' },
    })

    const map = new Map<string, PensionParameters>()
    for (const row of rows) {
      const key = row.system === 'ONP' ? 'ONP' : `AFP:${row.afpCode ?? ''}`
      // La primera que aparece es la mas reciente dentro de la vigencia.
      if (map.has(key)) continue
      map.set(key, {
        system: row.system,
        afpCode: row.afpCode,
        afpName: row.afpName,
        contributionRate: rateToString(row.contributionRate),
        commissionFlowRate: row.commissionFlowRate ? rateToString(row.commissionFlowRate) : null,
        commissionMixedRate: row.commissionMixedRate ? rateToString(row.commissionMixedRate) : null,
        insuranceRate: row.insuranceRate ? rateToString(row.insuranceRate) : null,
        insuranceCap: toMoneyOrNull(row.insuranceCap),
      })
    }
    return map
  }

  async upsertMany(
    rates: (PensionParameters & { validFrom: Date; validTo?: Date | null })[],
  ): Promise<number> {
    let count = 0
    for (const rate of rates) {
      const existing = await this.db.pensionRate.findFirst({
        where: { system: rate.system, afpCode: rate.afpCode ?? null, validFrom: rate.validFrom },
      })
      const data = {
        system: rate.system,
        afpCode: rate.afpCode ?? null,
        afpName: rate.afpName ?? null,
        validFrom: rate.validFrom,
        validTo: rate.validTo ?? null,
        contributionRate: new Prisma.Decimal(rate.contributionRate),
        commissionFlowRate: rate.commissionFlowRate ? new Prisma.Decimal(rate.commissionFlowRate) : null,
        commissionMixedRate: rate.commissionMixedRate ? new Prisma.Decimal(rate.commissionMixedRate) : null,
        insuranceRate: rate.insuranceRate ? new Prisma.Decimal(rate.insuranceRate) : null,
        insuranceCap: rate.insuranceCap ? toDecimal(rate.insuranceCap) : null,
      }
      if (existing) await this.db.pensionRate.update({ where: { id: existing.id }, data })
      else await this.db.pensionRate.create({ data })
      count++
    }
    return count
  }
}
