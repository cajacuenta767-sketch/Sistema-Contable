import { ValidationError } from '../../errors'

/**
 * Libros electronicos (PLE).
 *
 * ADVERTENCIA IMPORTANTE, LEASE ANTES DE USAR EN PRODUCCION
 * ---------------------------------------------------------
 * Las estructuras de los libros electronicos las fija SUNAT por resolucion de
 * superintendencia y CAMBIAN: se agregan campos, se renumeran columnas y se
 * modifican validaciones. Un archivo con la estructura de una version anterior
 * es rechazado por el validador.
 *
 * Por eso las estructuras viven aqui como DATOS, no repartidas por el codigo:
 * actualizar a una nueva resolucion es editar este archivo (o cargar un layout
 * propio desde la base), sin tocar la logica de generacion.
 *
 * Las definiciones incluidas corresponden a la version indicada en
 * `LAYOUT_VERSION` y DEBEN contrastarse con la resolucion vigente antes de
 * presentar. El sistema marca cada archivo generado con la version de layout
 * que uso, para que quede rastro de con que estructura se emitio.
 */

export const LAYOUT_VERSION = '5.3-referencia'

/** Como se serializa cada campo al texto plano. */
export type PleFieldFormat =
  | 'text' // tal cual
  | 'number' // decimal con punto y dos decimales
  | 'rate' // decimal con tres decimales (tipo de cambio)
  | 'date' // DD/MM/AAAA
  | 'period' // AAAAMM00
  | 'flag' // 1 / 0

export interface PleField {
  /** Numero de campo segun la estructura oficial. */
  position: number
  /** Clave con la que el generador busca el valor en la fila. */
  key: string
  /** Descripcion oficial del campo. */
  label: string
  format: PleFieldFormat
  /** Si es obligatorio, un valor vacio detiene la generacion. */
  required?: boolean
  /** Largo maximo. Se valida, no se trunca en silencio. */
  maxLength?: number
}

export interface PleBookLayout {
  /** Codigo de libro de 8 digitos usado en el nombre del archivo. */
  bookCode: string
  name: string
  /** Version de la estructura con la que se generó. */
  version: string
  fields: PleField[]
}

// ---------------------------------------------------------------------------
// Registro de Ventas e Ingresos (14.1)
// ---------------------------------------------------------------------------

export const SALES_BOOK: PleBookLayout = {
  bookCode: '140100',
  name: 'Registro de Ventas e Ingresos',
  version: LAYOUT_VERSION,
  fields: [
    { position: 1, key: 'period', label: 'Periodo', format: 'period', required: true },
    { position: 2, key: 'cuo', label: 'Codigo unico de la operacion', format: 'text', required: true, maxLength: 40 },
    { position: 3, key: 'correlative', label: 'Numero correlativo del asiento', format: 'text', required: true, maxLength: 10 },
    { position: 4, key: 'issueDate', label: 'Fecha de emision', format: 'date', required: true },
    { position: 5, key: 'dueDate', label: 'Fecha de vencimiento o pago', format: 'date' },
    { position: 6, key: 'docType', label: 'Tipo de comprobante', format: 'text', required: true, maxLength: 2 },
    { position: 7, key: 'serie', label: 'Serie del comprobante', format: 'text', required: true, maxLength: 20 },
    { position: 8, key: 'number', label: 'Numero del comprobante', format: 'text', required: true, maxLength: 20 },
    { position: 9, key: 'numberTo', label: 'Numero final (resumen diario)', format: 'text', maxLength: 20 },
    { position: 10, key: 'customerDocType', label: 'Tipo de documento del cliente', format: 'text', maxLength: 1 },
    { position: 11, key: 'customerDocNumber', label: 'Numero de documento del cliente', format: 'text', maxLength: 15 },
    { position: 12, key: 'customerName', label: 'Apellidos y nombres o razon social', format: 'text', maxLength: 100 },
    { position: 13, key: 'exportValue', label: 'Valor facturado de la exportacion', format: 'number' },
    { position: 14, key: 'taxableBase', label: 'Base imponible de la operacion gravada', format: 'number' },
    { position: 15, key: 'baseDiscount', label: 'Descuento de la base imponible', format: 'number' },
    { position: 16, key: 'igv', label: 'IGV y/o IPM', format: 'number' },
    { position: 17, key: 'igvDiscount', label: 'Descuento del IGV', format: 'number' },
    { position: 18, key: 'exemptAmount', label: 'Importe total de la operacion exonerada', format: 'number' },
    { position: 19, key: 'unaffectedAmount', label: 'Importe total de la operacion inafecta', format: 'number' },
    { position: 20, key: 'isc', label: 'Impuesto Selectivo al Consumo', format: 'number' },
    { position: 21, key: 'ivapBase', label: 'Base imponible gravada con IVAP', format: 'number' },
    { position: 22, key: 'ivap', label: 'Impuesto a la Venta del Arroz Pilado', format: 'number' },
    { position: 23, key: 'otherCharges', label: 'Otros tributos y cargos', format: 'number' },
    { position: 24, key: 'total', label: 'Importe total del comprobante', format: 'number', required: true },
    { position: 25, key: 'currency', label: 'Codigo de la moneda', format: 'text', required: true, maxLength: 3 },
    { position: 26, key: 'exchangeRate', label: 'Tipo de cambio', format: 'rate' },
    { position: 27, key: 'refIssueDate', label: 'Fecha de emision del comprobante modificado', format: 'date' },
    { position: 28, key: 'refDocType', label: 'Tipo del comprobante modificado', format: 'text', maxLength: 2 },
    { position: 29, key: 'refSerie', label: 'Serie del comprobante modificado', format: 'text', maxLength: 20 },
    { position: 30, key: 'refNumber', label: 'Numero del comprobante modificado', format: 'text', maxLength: 20 },
    { position: 31, key: 'contractDate', label: 'Fecha del contrato o acto', format: 'date' },
    { position: 32, key: 'errorType', label: 'Identificacion del contrato o proyecto', format: 'text', maxLength: 30 },
    { position: 33, key: 'accountingState', label: 'Estado que identifica la oportunidad de anotacion', format: 'text', required: true, maxLength: 1 },
  ],
}

// ---------------------------------------------------------------------------
// Registro de Compras (8.1)
// ---------------------------------------------------------------------------

export const PURCHASES_BOOK: PleBookLayout = {
  bookCode: '080100',
  name: 'Registro de Compras',
  version: LAYOUT_VERSION,
  fields: [
    { position: 1, key: 'period', label: 'Periodo', format: 'period', required: true },
    { position: 2, key: 'cuo', label: 'Codigo unico de la operacion', format: 'text', required: true, maxLength: 40 },
    { position: 3, key: 'correlative', label: 'Numero correlativo del asiento', format: 'text', required: true, maxLength: 10 },
    { position: 4, key: 'issueDate', label: 'Fecha de emision', format: 'date', required: true },
    { position: 5, key: 'dueDate', label: 'Fecha de vencimiento o pago', format: 'date' },
    { position: 6, key: 'docType', label: 'Tipo de comprobante', format: 'text', required: true, maxLength: 2 },
    { position: 7, key: 'serie', label: 'Serie del comprobante', format: 'text', required: true, maxLength: 20 },
    { position: 8, key: 'dua', label: 'Ano de emision de la DUA o DSI', format: 'text', maxLength: 4 },
    { position: 9, key: 'number', label: 'Numero del comprobante', format: 'text', required: true, maxLength: 20 },
    { position: 10, key: 'numberTo', label: 'Numero final', format: 'text', maxLength: 20 },
    { position: 11, key: 'supplierDocType', label: 'Tipo de documento del proveedor', format: 'text', maxLength: 1 },
    { position: 12, key: 'supplierDocNumber', label: 'Numero de documento del proveedor', format: 'text', maxLength: 15 },
    { position: 13, key: 'supplierName', label: 'Apellidos y nombres o razon social', format: 'text', maxLength: 100 },
    { position: 14, key: 'taxableBase', label: 'Base imponible - destinadas a operaciones gravadas', format: 'number' },
    { position: 15, key: 'igv', label: 'IGV - destinadas a operaciones gravadas', format: 'number' },
    { position: 16, key: 'mixedBase', label: 'Base imponible - gravadas y no gravadas', format: 'number' },
    { position: 17, key: 'mixedIgv', label: 'IGV - gravadas y no gravadas', format: 'number' },
    { position: 18, key: 'nonTaxableBase', label: 'Base imponible - no gravadas', format: 'number' },
    { position: 19, key: 'nonTaxableIgv', label: 'IGV - no gravadas', format: 'number' },
    { position: 20, key: 'unaffectedAmount', label: 'Valor de las adquisiciones no gravadas', format: 'number' },
    { position: 21, key: 'isc', label: 'Impuesto Selectivo al Consumo', format: 'number' },
    { position: 22, key: 'otherCharges', label: 'Otros tributos y cargos', format: 'number' },
    { position: 23, key: 'total', label: 'Importe total del comprobante', format: 'number', required: true },
    { position: 24, key: 'nonDomiciledDocNumber', label: 'Numero de documento del sujeto no domiciliado', format: 'text', maxLength: 15 },
    { position: 25, key: 'currency', label: 'Codigo de la moneda', format: 'text', required: true, maxLength: 3 },
    { position: 26, key: 'exchangeRate', label: 'Tipo de cambio', format: 'rate' },
    { position: 27, key: 'refIssueDate', label: 'Fecha de emision del comprobante modificado', format: 'date' },
    { position: 28, key: 'refDocType', label: 'Tipo del comprobante modificado', format: 'text', maxLength: 2 },
    { position: 29, key: 'refSerie', label: 'Serie del comprobante modificado', format: 'text', maxLength: 20 },
    { position: 30, key: 'refNumber', label: 'Numero del comprobante modificado', format: 'text', maxLength: 20 },
    { position: 31, key: 'detractionDate', label: 'Fecha del deposito de la detraccion', format: 'date' },
    { position: 32, key: 'detractionNumber', label: 'Numero de constancia del deposito de la detraccion', format: 'text', maxLength: 20 },
    { position: 33, key: 'retentionMark', label: 'Marca del comprobante sujeto a retencion', format: 'text', maxLength: 1 },
    { position: 34, key: 'accountingState', label: 'Estado que identifica la oportunidad de anotacion', format: 'text', required: true, maxLength: 1 },
  ],
}

// ---------------------------------------------------------------------------
// Libro Diario (5.1)
// ---------------------------------------------------------------------------

export const JOURNAL_BOOK: PleBookLayout = {
  bookCode: '050100',
  name: 'Libro Diario',
  version: LAYOUT_VERSION,
  fields: [
    { position: 1, key: 'period', label: 'Periodo', format: 'period', required: true },
    { position: 2, key: 'cuo', label: 'Codigo unico de la operacion', format: 'text', required: true, maxLength: 40 },
    { position: 3, key: 'correlative', label: 'Numero correlativo del asiento', format: 'text', required: true, maxLength: 10 },
    { position: 4, key: 'accountCode', label: 'Codigo de la cuenta contable', format: 'text', required: true, maxLength: 24 },
    { position: 5, key: 'costCenter', label: 'Codigo de la unidad de operacion', format: 'text', maxLength: 24 },
    { position: 6, key: 'counterpartyDocType', label: 'Tipo de documento de la entidad', format: 'text', maxLength: 2 },
    { position: 7, key: 'counterpartyDocNumber', label: 'Numero de documento de la entidad', format: 'text', maxLength: 15 },
    { position: 8, key: 'docType', label: 'Tipo de comprobante', format: 'text', maxLength: 2 },
    { position: 9, key: 'serie', label: 'Serie del comprobante', format: 'text', maxLength: 20 },
    { position: 10, key: 'number', label: 'Numero del comprobante', format: 'text', maxLength: 20 },
    { position: 11, key: 'entryDate', label: 'Fecha contable de la operacion', format: 'date', required: true },
    { position: 12, key: 'dueDate', label: 'Fecha de vencimiento', format: 'date' },
    { position: 13, key: 'issueDate', label: 'Fecha de emision del comprobante', format: 'date' },
    { position: 14, key: 'glossa', label: 'Glosa o descripcion de la operacion', format: 'text', maxLength: 200 },
    { position: 15, key: 'referenceGlossa', label: 'Glosa referencial', format: 'text', maxLength: 200 },
    { position: 16, key: 'debit', label: 'Movimiento del debe', format: 'number', required: true },
    { position: 17, key: 'credit', label: 'Movimiento del haber', format: 'number', required: true },
    { position: 18, key: 'operationStructure', label: 'Dato estructurado', format: 'text', maxLength: 40 },
    { position: 19, key: 'accountingState', label: 'Estado de la operacion', format: 'text', required: true, maxLength: 1 },
  ],
}

// ---------------------------------------------------------------------------
// Libro Mayor (6.1)
// ---------------------------------------------------------------------------

export const LEDGER_BOOK: PleBookLayout = {
  bookCode: '060100',
  name: 'Libro Mayor',
  version: LAYOUT_VERSION,
  fields: [
    { position: 1, key: 'period', label: 'Periodo', format: 'period', required: true },
    { position: 2, key: 'cuo', label: 'Codigo unico de la operacion', format: 'text', required: true, maxLength: 40 },
    { position: 3, key: 'correlative', label: 'Numero correlativo del asiento', format: 'text', required: true, maxLength: 10 },
    { position: 4, key: 'accountCode', label: 'Codigo de la cuenta contable', format: 'text', required: true, maxLength: 24 },
    { position: 5, key: 'counterAccountCode', label: 'Codigo de la cuenta de destino', format: 'text', maxLength: 24 },
    { position: 6, key: 'entryDate', label: 'Fecha contable de la operacion', format: 'date', required: true },
    { position: 7, key: 'glossa', label: 'Glosa o descripcion de la operacion', format: 'text', maxLength: 200 },
    { position: 8, key: 'debit', label: 'Movimiento del debe', format: 'number', required: true },
    { position: 9, key: 'credit', label: 'Movimiento del haber', format: 'number', required: true },
    { position: 10, key: 'accountingState', label: 'Estado de la operacion', format: 'text', required: true, maxLength: 1 },
  ],
}

export const BOOK_LAYOUTS: Record<string, PleBookLayout> = {
  [SALES_BOOK.bookCode]: SALES_BOOK,
  [PURCHASES_BOOK.bookCode]: PURCHASES_BOOK,
  [JOURNAL_BOOK.bookCode]: JOURNAL_BOOK,
  [LEDGER_BOOK.bookCode]: LEDGER_BOOK,
}

export function getLayout(bookCode: string): PleBookLayout {
  const layout = BOOK_LAYOUTS[bookCode]
  if (!layout) {
    throw new ValidationError(
      `No hay estructura definida para el libro ${bookCode}. ` +
        `Disponibles: ${Object.keys(BOOK_LAYOUTS).join(', ')}.`,
    )
  }
  return layout
}
