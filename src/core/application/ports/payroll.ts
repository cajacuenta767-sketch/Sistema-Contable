import type { Money } from '@/core/domain/value-objects/money'
import type {
  IncomeTaxBracket,
  PensionParameters,
} from '@/core/domain/payroll/parameters'

/** Puertos de planillas. */

export type PensionSystem = 'ONP' | 'AFP'
export type CommissionType = 'FLUJO' | 'MIXTA'
export type ContractType = 'INDEFINIDO' | 'PLAZO_FIJO' | 'TIEMPO_PARCIAL' | 'LOCACION'
export type HealthSystem = 'ESSALUD' | 'EPS'
export type EmployeeStatus = 'ACTIVO' | 'CESADO'
export type PayrollStatus = 'BORRADOR' | 'CERRADA'

export interface EmployeeRecord {
  id: string
  docType: string
  docNumber: string
  firstName: string
  lastName: string
  fullName: string
  position: string | null
  status: EmployeeStatus
  contractType: ContractType
  hireDate: Date
  terminationDate: Date | null
  basicSalary: Money
  familyAllowance: boolean
  pensionSystem: PensionSystem
  afpCode: string | null
  afpCuspp: string | null
  commissionType: CommissionType
  healthSystem: HealthSystem
  highRisk: boolean
  bankAccount: string | null
  clientId: string
}

export type CreateEmployeeInput = Omit<EmployeeRecord, 'id' | 'fullName' | 'status'> & {
  status?: EmployeeStatus
}

export interface EmployeeRepository {
  list(clientId: string, includeTerminated: boolean): Promise<EmployeeRecord[]>
  findById(id: string): Promise<EmployeeRecord | null>
  create(input: CreateEmployeeInput): Promise<EmployeeRecord>
  update(id: string, input: Partial<CreateEmployeeInput>): Promise<EmployeeRecord>
  /** Activos a una fecha: los que ya ingresaron y no cesaron antes de ella. */
  activeAt(clientId: string, date: Date): Promise<EmployeeRecord[]>
}

export interface PayrollItemRecord {
  id: string
  employeeId: string
  employeeName: string
  employeeDocNumber: string
  workedDays: number
  absentDays: number
  overtimeHours: number
  basicPay: Money
  familyAllowance: Money
  overtimePay: Money
  bonuses: Money
  grossPay: Money
  pensionContribution: Money
  pensionCommission: Money
  pensionInsurance: Money
  incomeTax5th: Money
  otherDeductions: Money
  totalDeductions: Money
  netPay: Money
  employerEssalud: Money
  employerSctr: Money
  employerTotal: Money
  breakdown: Record<string, string> | null
}

export interface PayrollRunRecord {
  id: string
  period: string
  status: PayrollStatus
  totalGross: Money
  totalDeductions: Money
  totalNet: Money
  totalEmployer: Money
  employeeCount: number
  closedAt: Date | null
  clientId: string
  createdAt: Date
  items: PayrollItemRecord[]
}

export interface PayrollRunRepository {
  find(clientId: string, period: string): Promise<PayrollRunRecord | null>
  findById(id: string): Promise<PayrollRunRecord | null>
  list(clientId: string, limit: number): Promise<Omit<PayrollRunRecord, 'items'>[]>
  /** Crea o reemplaza el calculo del periodo. Falla si la planilla esta cerrada. */
  save(input: {
    clientId: string
    period: string
    createdById: string | null
    items: Omit<PayrollItemRecord, 'id' | 'employeeName' | 'employeeDocNumber'>[]
  }): Promise<PayrollRunRecord>
  close(id: string, userId: string): Promise<PayrollRunRecord>
  reopen(id: string): Promise<PayrollRunRecord>
  /** Renta de quinta ya retenida al trabajador en el ejercicio. */
  withheldIncomeTaxToDate(employeeId: string, year: number, upToMonth: number): Promise<Money>
}

// ---------------------------------------------------------------------------
// Parametros normativos
// ---------------------------------------------------------------------------

export interface TaxParameterRecord {
  year: number
  uit: Money
  minimumWage: Money
  essaludRate: string
  sctrRate: string
  igvRate: string
  incomeTaxBrackets: IncomeTaxBracket[]
}

export interface TaxParameterRepository {
  forYear(year: number): Promise<TaxParameterRecord | null>
  upsert(input: TaxParameterRecord): Promise<TaxParameterRecord>
}

export interface PensionRateRepository {
  /** Tasas vigentes a una fecha. Clave: "ONP" o "AFP:<codigo>". */
  effectiveAt(date: Date): Promise<Map<string, PensionParameters>>
  upsertMany(
    rates: (PensionParameters & { validFrom: Date; validTo?: Date | null })[],
  ): Promise<number>
}
