import { ConflictError, NotFoundError, ValidationError } from '@/core/domain/errors'
import { Permissions } from '@/core/domain/services/permissions'
import type { AuthenticatedUser } from '@/core/domain/types'
import { Money } from '@/core/domain/value-objects/money'
import { TaxPeriod } from '@/core/domain/value-objects/tax-period'
import { PayslipService } from '@/core/domain/payroll/payslip'
import { PayrollEntryService } from '@/core/domain/payroll/payroll-entry'
import { PlameGenerator, type PlameExport } from '@/core/domain/payroll/plame/generator'
import type { PayrollParameters, PensionParameters } from '@/core/domain/payroll/parameters'
import type {
  CreateEmployeeInput,
  EmployeeRecord,
  EmployeeRepository,
  PayrollItemRecord,
  PayrollRunRecord,
  PayrollRunRepository,
  PensionRateRepository,
  TaxParameterRepository,
} from '../ports/payroll'
import type { AuditLogRepository, ClientRepository } from '../ports'
import type {
  AccountRepository,
  AccountingPeriodRepository,
  JournalEntryRecord,
  JournalRepository,
} from '../ports/accounting'

/**
 * Casos de uso de planillas.
 *
 * El calculo vive en el dominio (PayslipService). Aqui se resuelve de donde
 * salen los insumos —trabajadores vigentes, parametros del ejercicio, tasas de
 * pension de la fecha, retenciones acumuladas— y se persiste el resultado.
 *
 * Esa separacion importa: recalcular la planilla de un mes pasado exige los
 * parametros que regian ENTONCES, y eso es una decision de obtencion de datos,
 * no de calculo.
 */

/** Ajustes manuales por trabajador para el periodo. */
export interface PayrollAdjustment {
  employeeId: string
  workedDays?: number
  absentDays?: number
  overtimeHours25?: number
  overtimeHours35?: number
  bonuses?: Money
  otherDeductions?: Money
}

export class PayrollUseCases {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly runs: PayrollRunRepository,
    private readonly parameters: TaxParameterRepository,
    private readonly pensionRates: PensionRateRepository,
    private readonly journal: JournalRepository,
    private readonly accounts: AccountRepository,
    private readonly periods: AccountingPeriodRepository,
    private readonly clients: ClientRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  // -------------------------------------------------------------------------
  // Trabajadores
  // -------------------------------------------------------------------------

  async listEmployees(
    user: AuthenticatedUser,
    clientId: string,
    includeTerminated = false,
  ): Promise<EmployeeRecord[]> {
    Permissions.assert(user, 'client:read:own')
    return this.employees.list(clientId, includeTerminated)
  }

  async createEmployee(
    user: AuthenticatedUser,
    input: CreateEmployeeInput,
  ): Promise<EmployeeRecord> {
    Permissions.assert(user, 'client:write')

    if (!input.firstName.trim() || !input.lastName.trim()) {
      throw new ValidationError('El nombre y los apellidos son obligatorios')
    }
    if (!input.docNumber.trim()) {
      throw new ValidationError('El numero de documento es obligatorio')
    }
    if (!input.basicSalary.isPositive()) {
      throw new ValidationError('La remuneracion basica debe ser mayor a cero')
    }
    // Un afiliado a AFP sin administradora no se puede calcular: la tasa
    // depende de cual es.
    if (input.pensionSystem === 'AFP' && !input.afpCode) {
      throw new ValidationError('Indique la AFP del trabajador')
    }
    if (input.terminationDate && input.terminationDate < input.hireDate) {
      throw new ValidationError('La fecha de cese no puede ser anterior al ingreso')
    }

    const employee = await this.employees.create(input)

    await this.audit.record({
      action: 'employee.create',
      entity: 'Employee',
      entityId: employee.id,
      userId: user.id,
      metadata: { clientId: input.clientId, docNumber: input.docNumber },
    })

    return employee
  }

  async updateEmployee(
    user: AuthenticatedUser,
    id: string,
    input: Partial<CreateEmployeeInput>,
  ): Promise<EmployeeRecord> {
    Permissions.assert(user, 'client:write')
    const existing = await this.employees.findById(id)
    if (!existing) throw new NotFoundError('el trabajador', id)

    const updated = await this.employees.update(id, input)

    await this.audit.record({
      action: 'employee.update',
      entity: 'Employee',
      entityId: id,
      userId: user.id,
      metadata: { changes: Object.keys(input) },
    })

    return updated
  }

  // -------------------------------------------------------------------------
  // Planilla del periodo
  // -------------------------------------------------------------------------

  async getRun(
    user: AuthenticatedUser,
    clientId: string,
    period: string,
  ): Promise<PayrollRunRecord | null> {
    Permissions.assert(user, 'client:read:own')
    return this.runs.find(clientId, period)
  }

  async getRunById(user: AuthenticatedUser, id: string): Promise<PayrollRunRecord> {
    Permissions.assert(user, 'client:read:own')
    const run = await this.runs.findById(id)
    if (!run) throw new NotFoundError('la planilla', id)
    return run
  }

  async listRuns(user: AuthenticatedUser, clientId: string) {
    Permissions.assert(user, 'client:read:own')
    return this.runs.list(clientId, 24)
  }

  /**
   * Calcula (o recalcula) la planilla del periodo.
   *
   * Recalcular es idempotente: reemplaza el detalle anterior completo. No
   * acumula boletas viejas con nuevas, porque entonces los totales no
   * corresponderian a ninguna version del calculo.
   */
  async computeRun(
    user: AuthenticatedUser,
    input: { clientId: string; period: string; adjustments?: PayrollAdjustment[] },
  ): Promise<{ run: PayrollRunRecord; warnings: string[] }> {
    Permissions.assert(user, 'client:write')
    const period = TaxPeriod.create(input.period)

    const existing = await this.runs.find(input.clientId, input.period)
    if (existing?.status === 'CERRADA') {
      throw new ConflictError(
        `La planilla de ${input.period} esta cerrada. Reabrala antes de recalcular.`,
      )
    }

    // Ultimo dia del periodo: es la fecha con la que se evalua quien estaba
    // vigente y que tasas regian.
    const referenceDate = new Date(Date.UTC(period.year, period.month, 0, 12))

    const parameters = await this.parameters.forYear(period.year)
    if (!parameters) {
      throw new ConflictError(
        `No hay parametros cargados para el ejercicio ${period.year} (UIT, remuneracion ` +
          'minima, tramos de renta). Carguelos antes de calcular la planilla.',
      )
    }

    const [employees, rates] = await Promise.all([
      this.employees.activeAt(input.clientId, referenceDate),
      this.pensionRates.effectiveAt(referenceDate),
    ])

    if (employees.length === 0) {
      throw new ConflictError(
        `No hay trabajadores vigentes al ${referenceDate.toISOString().slice(0, 10)} ` +
          'para esta empresa.',
      )
    }

    const adjustments = new Map(
      (input.adjustments ?? []).map((adjustment) => [adjustment.employeeId, adjustment]),
    )

    const payrollParameters: PayrollParameters = {
      year: parameters.year,
      uit: parameters.uit,
      minimumWage: parameters.minimumWage,
      essaludRate: parameters.essaludRate,
      sctrRate: parameters.sctrRate,
      incomeTaxBrackets: parameters.incomeTaxBrackets,
      incomeTaxDeductionUit: 7,
    }

    const warnings: string[] = []
    const items: Omit<PayrollItemRecord, 'id' | 'employeeName' | 'employeeDocNumber'>[] = []

    for (const employee of employees) {
      // Los honorarios no van en planilla de quinta categoria: son cuarta.
      if (employee.contractType === 'LOCACION') {
        warnings.push(
          `${employee.fullName} tiene contrato de locacion de servicios: sus honorarios son ` +
            'renta de cuarta categoria y no forman parte de esta planilla.',
        )
        continue
      }

      const pension = this.resolvePension(employee, rates, warnings)
      if (!pension) continue

      const adjustment = adjustments.get(employee.id)
      const withheld = await this.runs.withheldIncomeTaxToDate(
        employee.id,
        period.year,
        period.month,
      )

      const result = PayslipService.compute({
        employee: {
          fullName: employee.fullName,
          basicSalary: employee.basicSalary,
          hasFamilyAllowance: employee.familyAllowance,
          highRisk: employee.highRisk,
          pension,
        },
        workedDays: adjustment?.workedDays ?? 30,
        absentDays: adjustment?.absentDays ?? 0,
        overtimeHours25: adjustment?.overtimeHours25 ?? 0,
        overtimeHours35: adjustment?.overtimeHours35 ?? 0,
        bonuses: adjustment?.bonuses ?? Money.zero(),
        otherDeductions: adjustment?.otherDeductions ?? Money.zero(),
        incomeTaxWithheldToDate: withheld,
        month: period.month,
        parameters: payrollParameters,
      })

      for (const warning of result.warnings) {
        warnings.push(`${employee.fullName}: ${warning}`)
      }

      items.push({
        employeeId: employee.id,
        workedDays: adjustment?.workedDays ?? 30,
        absentDays: adjustment?.absentDays ?? 0,
        overtimeHours: (adjustment?.overtimeHours25 ?? 0) + (adjustment?.overtimeHours35 ?? 0),
        basicPay: result.earnings.basicPay,
        familyAllowance: result.earnings.familyAllowance,
        overtimePay: result.earnings.overtimePay,
        bonuses: result.earnings.bonuses,
        grossPay: result.earnings.gross,
        pensionContribution: result.deductions.pensionContribution,
        pensionCommission: result.deductions.pensionCommission,
        pensionInsurance: result.deductions.pensionInsurance,
        incomeTax5th: result.deductions.incomeTax5th,
        otherDeductions: result.deductions.other,
        totalDeductions: result.deductions.total,
        netPay: result.netPay,
        employerEssalud: result.employer.essalud,
        employerSctr: result.employer.sctr,
        employerTotal: result.employer.total,
        breakdown: result.breakdown,
      })
    }

    const run = await this.runs.save({
      clientId: input.clientId,
      period: input.period,
      createdById: user.id,
      items,
    })

    await this.audit.record({
      action: 'payroll.compute',
      entity: 'PayrollRun',
      entityId: run.id,
      userId: user.id,
      metadata: {
        clientId: input.clientId,
        period: input.period,
        employees: items.length,
        totalNet: run.totalNet.toString(),
      },
    })

    return { run, warnings }
  }

  /**
   * Cierra la planilla y genera su asiento de provision.
   *
   * El asiento se genera AL CERRAR y no al calcular: mientras la planilla es
   * un borrador que se recalcula, un asiento contable por cada intento
   * ensuciaria el libro. El cierre es el momento en que las cifras se dan por
   * definitivas.
   *
   * El asiento nace en BORRADOR: el contador decide cuando confirmarlo, igual
   * que con los asientos que vienen de comprobantes.
   *
   * Si el asiento falla, la planilla YA quedo cerrada: no se pierde el trabajo
   * y el asiento puede hacerse a mano. Se informa en la respuesta.
   */
  async closeRun(
    user: AuthenticatedUser,
    runId: string,
  ): Promise<{ run: PayrollRunRecord; entry: JournalEntryRecord | null; warnings: string[] }> {
    Permissions.assert(user, 'client:write')

    const run = await this.runs.findById(runId)
    if (!run) throw new NotFoundError('la planilla', runId)
    if (run.status === 'CERRADA') throw new ConflictError('La planilla ya esta cerrada')
    if (run.items.length === 0) {
      throw new ConflictError('No se puede cerrar una planilla sin trabajadores')
    }

    const closed = await this.runs.close(runId, user.id)
    const warnings: string[] = []

    let entry: JournalEntryRecord | null = null
    try {
      entry = await this.buildPayrollEntry(user, closed)
    } catch (error) {
      warnings.push(
        `La planilla se cerro, pero no se pudo generar su asiento de provision: ${
          error instanceof Error ? error.message : 'error desconocido'
        }. Registrelo manualmente.`,
      )
    }

    await this.audit.record({
      action: 'payroll.close',
      entity: 'PayrollRun',
      entityId: runId,
      userId: user.id,
      metadata: {
        period: run.period,
        totalNet: run.totalNet.toString(),
        entryId: entry?.id ?? null,
      },
    })

    return { run: closed, entry, warnings }
  }

  /**
   * Arma el asiento de provision a partir de los totales de la planilla.
   *
   * Los aportes se separan por sistema previsional porque van a cuentas
   * distintas: lo retenido a un afiliado a ONP se debe a la ONP, y lo retenido
   * a uno de AFP a su administradora. Agruparlos haria imposible conciliar
   * cualquiera de los dos pagos.
   */
  private async buildPayrollEntry(
    user: AuthenticatedUser,
    run: PayrollRunRecord,
  ): Promise<JournalEntryRecord> {
    const period = await this.periods.find(run.clientId, run.period)
    if (period?.status === 'CERRADO') {
      throw new ConflictError(
        `El periodo contable ${run.period} esta cerrado: no admite el asiento de planilla.`,
      )
    }

    const employees = await this.employees.list(run.clientId, true)
    const systemById = new Map(employees.map((e) => [e.id, e.pensionSystem]))

    const zero = Money.zero()
    const totals = {
      gross: zero,
      onpContributions: zero,
      afpContributions: zero,
      incomeTax: zero,
      otherDeductions: zero,
      netPay: zero,
      employerEssalud: zero,
      employerSctr: zero,
    }

    for (const item of run.items) {
      const pensionTotal = item.pensionContribution
        .add(item.pensionCommission)
        .add(item.pensionInsurance)

      totals.gross = totals.gross.add(item.grossPay)
      totals.incomeTax = totals.incomeTax.add(item.incomeTax5th)
      totals.otherDeductions = totals.otherDeductions.add(item.otherDeductions)
      totals.netPay = totals.netPay.add(item.netPay)
      totals.employerEssalud = totals.employerEssalud.add(item.employerEssalud)
      totals.employerSctr = totals.employerSctr.add(item.employerSctr)

      if (systemById.get(item.employeeId) === 'AFP') {
        totals.afpContributions = totals.afpContributions.add(pensionTotal)
      } else {
        totals.onpContributions = totals.onpContributions.add(pensionTotal)
      }
    }

    const taxPeriod = TaxPeriod.create(run.period)
    const draft = PayrollEntryService.build(totals, {
      // Ultimo dia del periodo: es la fecha contable de la provision.
      date: new Date(Date.UTC(taxPeriod.year, taxPeriod.month, 0, 12)),
      period: run.period,
      periodLabel: taxPeriod.label(),
    })

    const chart = await this.accounts.chartFor(run.clientId)
    const names = new Map(chart.map((a) => [a.code, a.name]))

    return this.journal.create({
      clientId: run.clientId,
      date: draft.date,
      period: draft.period,
      glossa: draft.glossa,
      source: 'AUTOMATICO',
      status: 'BORRADOR',
      createdById: user.id,
      lines: draft.lines.map((line, index) => ({
        order: index + 1,
        accountCode: line.accountCode,
        accountName: names.get(line.accountCode) ?? line.accountCode,
        debit: line.debit,
        credit: line.credit,
        glossa: draft.glossa,
        counterpartyDocType: null,
        counterpartyDocNumber: null,
        docType: null,
        serie: null,
        docNumber: null,
      })),
    })
  }

  /**
   * Reabre una planilla cerrada.
   *
   * Es excepcional y por eso exige el permiso mas alto, el mismo que archivar
   * un cliente: reabrir una planilla significa que se van a corregir boletas
   * ya emitidas y aportes posiblemente ya declarados. Queda en la auditoria.
   */
  async reopenRun(user: AuthenticatedUser, runId: string): Promise<PayrollRunRecord> {
    Permissions.assert(user, 'client:archive')

    const run = await this.runs.findById(runId)
    if (!run) throw new NotFoundError('la planilla', runId)
    if (run.status !== 'CERRADA') throw new ConflictError('La planilla no esta cerrada')

    const reopened = await this.runs.reopen(runId)

    await this.audit.record({
      action: 'payroll.reopen',
      entity: 'PayrollRun',
      entityId: runId,
      userId: user.id,
      metadata: { period: run.period },
    })

    return reopened
  }

  /**
   * Archivos de importacion del PDT PLAME.
   *
   * Se generan desde la planilla ya calculada. El PDT sigue siendo el que
   * presenta la declaracion: estos archivos solo evitan digitar trabajador por
   * trabajador, que con veinte empleados son varias horas y varios errores.
   */
  async generatePlame(
    user: AuthenticatedUser,
    clientId: string,
    period: string,
  ): Promise<PlameExport> {
    Permissions.assert(user, 'client:write')

    const client = await this.clients.findById(clientId)
    if (!client) throw new NotFoundError('el cliente', clientId)

    const run = await this.runs.find(clientId, period)
    if (!run) {
      throw new NotFoundError('la planilla del periodo', period)
    }

    const employees = await this.employees.list(clientId, true)
    const byId = new Map(employees.map((e) => [e.id, e]))

    const rows = run.items.flatMap((item) => {
      const employee = byId.get(item.employeeId)
      // Un trabajador borrado deja su boleta huerfana: se omite del archivo
      // en vez de generar una linea sin documento, que el PDT rechazaria.
      if (!employee) return []

      return [
        {
          docType: employee.docType.padStart(2, '0'),
          docNumber: employee.docNumber,
          fullName: employee.fullName,
          pensionSystem: employee.pensionSystem,
          workedDays: item.workedDays,
          absentDays: item.absentDays,
          overtimeHours: item.overtimeHours,
          basicPay: item.basicPay,
          familyAllowance: item.familyAllowance,
          overtimePay: item.overtimePay,
          bonuses: item.bonuses,
          pensionContribution: item.pensionContribution,
          pensionCommission: item.pensionCommission,
          pensionInsurance: item.pensionInsurance,
          incomeTax5th: item.incomeTax5th,
          otherDeductions: item.otherDeductions,
          employerEssalud: item.employerEssalud,
          employerSctr: item.employerSctr,
        },
      ]
    })

    const result = PlameGenerator.generate({ ruc: client.ruc, period, employees: rows })

    await this.audit.record({
      action: 'plame.generate',
      entity: 'PayrollRun',
      entityId: run.id,
      userId: user.id,
      metadata: {
        clientId,
        period,
        files: result.files.map((f) => ({ name: f.fileName, lines: f.lineCount })),
      },
    })

    return result
  }

  /** Boleta individual, con el detalle del calculo para poder sustentarla. */
  async payslip(user: AuthenticatedUser, runId: string, employeeId: string) {
    Permissions.assert(user, 'client:read:own')

    const run = await this.runs.findById(runId)
    if (!run) throw new NotFoundError('la planilla', runId)

    const item = run.items.find((i) => i.employeeId === employeeId)
    if (!item) throw new NotFoundError('la boleta del trabajador', employeeId)

    const employee = await this.employees.findById(employeeId)
    if (!employee) throw new NotFoundError('el trabajador', employeeId)

    return { run: { id: run.id, period: run.period, status: run.status }, item, employee }
  }

  /**
   * Resuelve las tasas de pension del trabajador a la fecha del periodo.
   * Si no hay tasas cargadas para su sistema, se omite del calculo con un
   * aviso: inventar una tasa produciria una boleta con cifras falsas.
   */
  private resolvePension(
    employee: EmployeeRecord,
    rates: Map<string, PensionParameters>,
    warnings: string[],
  ): PensionParameters | null {
    const key = employee.pensionSystem === 'ONP' ? 'ONP' : `AFP:${employee.afpCode ?? ''}`
    const found = rates.get(key)

    if (!found) {
      warnings.push(
        `${employee.fullName}: no hay tasas cargadas para ${key} en este periodo. ` +
          'El trabajador quedo FUERA del calculo. Cargue las tasas y recalcule.',
      )
      return null
    }

    // La modalidad mixta usa una comision distinta a la de flujo.
    if (employee.commissionType === 'MIXTA' && found.commissionMixedRate) {
      return { ...found, commissionFlowRate: found.commissionMixedRate }
    }
    return found
  }
}
