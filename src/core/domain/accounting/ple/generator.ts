import { ValidationError } from '../../errors'
import { Money } from '../../value-objects/money'
import { TaxPeriod } from '../../value-objects/tax-period'
import { getLayout, type PleBookLayout, type PleField } from './layout'

/**
 * Generador de archivos PLE.
 *
 * Formato: campos separados por "|", cada linea TERMINA tambien en "|", y el
 * salto de linea es CRLF. Los tres detalles importan: el validador de SUNAT
 * rechaza el archivo si falta el separador final o si el salto es solo LF.
 *
 * La codificacion es ANSI/Latin-1, no UTF-8. Las razones sociales con enie o
 * tilde tienen que ir en esa codificacion; se convierten al escribir el
 * archivo (ver `toBuffer`).
 */

const FIELD_SEPARATOR = '|'
const LINE_TERMINATOR = '\r\n'

/** Valor admitido para una celda antes de formatear. */
export type PleValue = string | number | Money | Date | null | undefined

export type PleRow = Record<string, PleValue>

export interface PleFile {
  fileName: string
  content: string
  lineCount: number
  bookCode: string
  bookName: string
  layoutVersion: string
  /** Totales de control, para cotejar contra el balance antes de presentar. */
  totals?: { debit: string; credit: string }
  warnings: string[]
}

export interface GenerateOptions {
  bookCode: string
  ruc: string
  period: string
  rows: PleRow[]
  /**
   * Indicador de operaciones: "1" si el libro tiene informacion, "0" si se
   * presenta sin movimientos. Un periodo sin operaciones igual debe
   * presentarse; no presentarlo es una infraccion.
   */
  hasOperations?: boolean
  /** Moneda del libro: 1 = soles, 2 = dolares. */
  currencyIndicator?: '1' | '2'
}

export const PleGenerator = {
  generate(options: GenerateOptions): PleFile {
    const layout = getLayout(options.bookCode)
    const period = TaxPeriod.create(options.period)
    const warnings: string[] = []

    const lines = options.rows.map((row, index) =>
      buildLine(layout, row, index + 1, warnings),
    )

    // Un libro sin movimientos se presenta igual, con el indicador en 0 y sin
    // lineas de detalle.
    const hasOperations = options.hasOperations ?? lines.length > 0

    const fileName = buildFileName({
      ruc: options.ruc,
      period,
      bookCode: layout.bookCode,
      hasOperations,
      currencyIndicator: options.currencyIndicator ?? '1',
    })

    warnings.push(
      `Generado con la estructura "${layout.version}". Verifique que corresponda a la ` +
        'resolucion de superintendencia vigente antes de presentar el archivo.',
    )

    return {
      fileName,
      content: lines.length > 0 ? lines.join(LINE_TERMINATOR) + LINE_TERMINATOR : '',
      lineCount: lines.length,
      bookCode: layout.bookCode,
      bookName: layout.name,
      layoutVersion: layout.version,
      totals: computeTotals(options.rows),
      warnings,
    }
  },

  /**
   * Convierte el contenido a Latin-1, que es la codificacion que espera el
   * validador. Los caracteres fuera del juego se reemplazan por su
   * equivalente sin acento en lugar de producir bytes invalidos.
   */
  toBuffer(content: string): Buffer {
    const normalized = content
      .normalize('NFD')
      // Se conservan enie y ce cedilla, que SI existen en Latin-1; se quitan
      // solo los diacriticos que no forman parte del juego de caracteres.
      .replace(/[̀-̂̄-̇̉-̧]/g, '')
      .normalize('NFC')
    return Buffer.from(normalized, 'latin1')
  },
}

/**
 * Nomenclatura del archivo:
 *
 *   LE + RUC(11) + AAAA + MM + DD + codigoLibro(8) + oportunidad(2)
 *      + indicadorOperaciones(1) + indicadorContenido(1) + indicadorMoneda(1)
 *      + indicadorPLE(1) + ".TXT"
 *
 * Para libros mensuales el dia va en "00". La oportunidad ("00") solo cambia
 * en los libros anuales de estados financieros.
 */
export function buildFileName(input: {
  ruc: string
  period: TaxPeriod
  bookCode: string
  hasOperations: boolean
  currencyIndicator: '1' | '2'
}): string {
  if (!/^\d{11}$/.test(input.ruc)) {
    throw new ValidationError(`RUC invalido para el nombre del archivo: ${input.ruc}`)
  }

  const year = String(input.period.year)
  const month = String(input.period.month).padStart(2, '0')
  const day = '00' // libro mensual
  const book = input.bookCode.padEnd(8, '0')
  const opportunity = '00'
  const operations = input.hasOperations ? '1' : '0'
  const content = '1' // 1 = con informacion
  const currency = input.currencyIndicator
  const generatedByPle = '1'

  return (
    `LE${input.ruc}${year}${month}${day}${book}${opportunity}` +
    `${operations}${content}${currency}${generatedByPle}.TXT`
  )
}

function buildLine(
  layout: PleBookLayout,
  row: PleRow,
  lineNumber: number,
  warnings: string[],
): string {
  const cells = layout.fields.map((field) => {
    const raw = row[field.key]
    const value = formatValue(raw, field)

    if (field.required && value === '') {
      throw new ValidationError(
        `Linea ${lineNumber}, campo ${field.position} (${field.label}): es obligatorio y llego vacio`,
        { field: field.key, line: lineNumber },
      )
    }

    if (field.maxLength && value.length > field.maxLength) {
      // Se avisa y se recorta: un campo largo hace fallar el archivo entero,
      // y el usuario prefiere un nombre truncado a una presentacion rechazada.
      warnings.push(
        `Linea ${lineNumber}, campo ${field.position} (${field.label}): se recorto de ` +
          `${value.length} a ${field.maxLength} caracteres.`,
      )
      return sanitize(value.slice(0, field.maxLength))
    }

    return sanitize(value)
  })

  return cells.join(FIELD_SEPARATOR) + FIELD_SEPARATOR
}

function formatValue(value: PleValue, field: PleField): string {
  if (value === null || value === undefined) {
    // Los importes vacios van como 0.00, no en blanco: el validador espera un
    // numero en esas posiciones.
    return field.format === 'number' ? '0.00' : ''
  }

  switch (field.format) {
    case 'number':
      if (value instanceof Money) return value.toString()
      if (typeof value === 'number') return Money.fromNumber(value).toString()
      return Money.fromString(String(value)).toString()

    case 'rate': {
      const rate = typeof value === 'number' ? value : Number(String(value))
      return Number.isFinite(rate) ? rate.toFixed(3) : ''
    }

    case 'date':
      return value instanceof Date ? formatDdMmYyyy(value) : String(value)

    case 'period':
      return typeof value === 'string' ? `${value.replace('-', '')}00` : ''

    case 'flag':
      return value ? '1' : '0'

    case 'text':
    default:
      return String(value)
  }
}

/**
 * El "|" es el separador de campos: si aparece dentro de una razon social
 * corre todas las columnas siguientes y corrompe el archivo. Se reemplaza,
 * igual que los saltos de linea.
 */
function sanitize(value: string): string {
  return value.replace(/[|\r\n]/g, ' ').trim()
}

function formatDdMmYyyy(date: Date): string {
  // Se leen las partes en la zona de Lima: usar getUTCDate mostraria el dia
  // siguiente para cualquier comprobante emitido despues de las 19:00.
  const lima = new Date(date.getTime() - 5 * 3_600_000)
  const day = String(lima.getUTCDate()).padStart(2, '0')
  const month = String(lima.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${lima.getUTCFullYear()}`
}

function computeTotals(rows: PleRow[]): { debit: string; credit: string } | undefined {
  if (rows.length === 0 || !('debit' in (rows[0] ?? {}))) return undefined

  const toMoney = (value: PleValue): Money =>
    value instanceof Money ? value : Money.fromString(String(value ?? '0'))

  return {
    debit: Money.sum(rows.map((r) => toMoney(r.debit))).toString(),
    credit: Money.sum(rows.map((r) => toMoney(r.credit))).toString(),
  }
}
