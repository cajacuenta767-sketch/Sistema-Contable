import { ValidationError } from '../../errors'
import { Money } from '../../value-objects/money'
import { TaxPeriod } from '../../value-objects/tax-period'
import {
  PLAME_CONCEPTS,
  PLAME_FILES,
  PLAME_LAYOUT_VERSION,
  type PlameConceptKey,
  type PlameFileKind,
} from './layout'

/**
 * Generacion de los archivos de importacion del PDT PLAME.
 *
 * Mismo formato de texto plano que el PLE: campos separados por "|", cada
 * linea termina tambien en "|", salto CRLF y codificacion Latin-1. Los tres
 * detalles importan igual: el importador los valida.
 */

const FIELD_SEPARATOR = '|'
const LINE_TERMINATOR = '\r\n'

/** Jornada legal: 8 horas al dia. */
const HOURS_PER_DAY = 8

export interface PlameEmployeeInput {
  docType: string
  docNumber: string
  fullName: string
  pensionSystem: 'ONP' | 'AFP'
  workedDays: number
  absentDays: number
  overtimeHours: number
  basicPay: Money
  familyAllowance: Money
  overtimePay: Money
  bonuses: Money
  pensionContribution: Money
  pensionCommission: Money
  pensionInsurance: Money
  incomeTax5th: Money
  otherDeductions: Money
  employerEssalud: Money
  employerSctr: Money
}

export interface PlameFile {
  kind: PlameFileKind
  fileName: string
  name: string
  content: string
  lineCount: number
  layoutVersion: string
}

export interface PlameExport {
  files: PlameFile[]
  warnings: string[]
}

export const PlameGenerator = {
  /**
   * @param ruc RUC del empleador.
   * @param period Periodo "YYYY-MM".
   * @param employees Boletas del periodo.
   */
  generate(input: {
    ruc: string
    period: string
    employees: PlameEmployeeInput[]
  }): PlameExport {
    if (!/^\d{11}$/.test(input.ruc)) {
      throw new ValidationError(`RUC invalido para el archivo PLAME: ${input.ruc}`)
    }
    const period = TaxPeriod.create(input.period)
    const warnings: string[] = []

    if (input.employees.length === 0) {
      warnings.push(
        'La planilla no tiene trabajadores: los archivos se generan vacios. ' +
          'Un periodo sin trabajadores igual debe declararse.',
      )
    }

    const jornadaLines = input.employees.map((employee) => {
      const workedDays = employee.workedDays
      return joinLine([
        employee.docType,
        employee.docNumber,
        String(workedDays),
        '0', // dias subsidiados: no se modelan todavia
        String(employee.absentDays),
        (workedDays * HOURS_PER_DAY).toFixed(2),
        employee.overtimeHours.toFixed(2),
      ])
    })

    const conceptoLines: string[] = []
    for (const employee of input.employees) {
      // El sistema previsional decide el codigo: lo retenido a un afiliado a
      // ONP no puede ir con el codigo de AFP, ni al reves.
      const pensionConcepts: [PlameConceptKey, Money][] =
        employee.pensionSystem === 'ONP'
          ? [['ONP', employee.pensionContribution]]
          : [
              ['AFP_CONTRIBUTION', employee.pensionContribution],
              ['AFP_COMMISSION', employee.pensionCommission],
              ['AFP_INSURANCE', employee.pensionInsurance],
            ]

      const concepts: [PlameConceptKey, Money][] = [
        ['BASIC_SALARY', employee.basicPay],
        ['FAMILY_ALLOWANCE', employee.familyAllowance],
        ['OVERTIME', employee.overtimePay],
        ['BONUSES', employee.bonuses],
        ...pensionConcepts,
        ['INCOME_TAX', employee.incomeTax5th],
        ['OTHER_DEDUCTIONS', employee.otherDeductions],
        ['ESSALUD', employee.employerEssalud],
        ['SCTR', employee.employerSctr],
      ]

      for (const [key, amount] of concepts) {
        // Los conceptos en cero no se declaran: el importador los rechaza.
        if (amount.isZero()) continue
        conceptoLines.push(
          joinLine([
            employee.docType,
            employee.docNumber,
            PLAME_CONCEPTS[key].code,
            amount.toString(),
          ]),
        )
      }
    }

    warnings.push(
      `Generado con la estructura "${PLAME_LAYOUT_VERSION}". Verifique que corresponda a la ` +
        'version vigente del PDT PLAME antes de importar.',
    )
    warnings.push(
      'Estos archivos se IMPORTAN al PDT PLAME. La declaracion se presenta desde el PDT: ' +
        'el sistema no presenta ante SUNAT.',
    )

    return {
      files: [
        buildFile('JORNADA', input.ruc, period, jornadaLines),
        buildFile('CONCEPTOS', input.ruc, period, conceptoLines),
      ],
      warnings,
    }
  },

  /** Igual que el PLE: el importador espera Latin-1, no UTF-8. */
  toBuffer(content: string): Buffer {
    const normalized = content
      .normalize('NFD')
      .replace(/[̀-̂̄-̇̉-̧]/g, '')
      .normalize('NFC')
    return Buffer.from(normalized, 'latin1')
  },
}

function buildFile(
  kind: PlameFileKind,
  ruc: string,
  period: TaxPeriod,
  lines: string[],
): PlameFile {
  const layout = PLAME_FILES[kind]
  const yearMonth = `${period.year}${String(period.month).padStart(2, '0')}`

  return {
    kind,
    // Nomenclatura del PDT: formulario + RUC + periodo + extension.
    fileName: `0601${ruc}${yearMonth}.${layout.extension}`,
    name: layout.name,
    content: lines.length > 0 ? lines.join(LINE_TERMINATOR) + LINE_TERMINATOR : '',
    lineCount: lines.length,
    layoutVersion: layout.version,
  }
}

function joinLine(cells: string[]): string {
  // El separador dentro de un dato corromperia todas las columnas siguientes.
  return cells.map((cell) => cell.replace(/[|\r\n]/g, ' ').trim()).join(FIELD_SEPARATOR) +
    FIELD_SEPARATOR
}
