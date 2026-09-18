/**
 * PLAME - Planilla Mensual Electronica (PDT 601).
 *
 * ADVERTENCIA, LEASE ANTES DE USAR EN PRODUCCION
 * -----------------------------------------------
 * Igual que con los libros electronicos, SUNAT fija las estructuras de los
 * archivos de importacion del PDT PLAME y las cambia por resolucion. Las
 * estructuras y los codigos de concepto incluidos aqui son DE REFERENCIA y
 * deben contrastarse con la version vigente del PDT antes de importar.
 *
 * Estan aqui como DATOS por el mismo motivo que las del PLE: actualizar debe
 * ser editar esta tabla, no tocar la logica de generacion.
 *
 * El archivo generado se IMPORTA al PDT PLAME; el PDT sigue siendo el que
 * presenta la declaracion. El sistema no presenta ante SUNAT.
 */

export const PLAME_LAYOUT_VERSION = '3.9-referencia'

/**
 * Codigos de concepto remunerativo.
 *
 * El codigo define como SUNAT trata cada importe: si es base de aportes, si es
 * renta de quinta, si es un descuento. Un concepto mal codificado produce una
 * declaracion con bases incorrectas.
 */
export const PLAME_CONCEPTS = {
  BASIC_SALARY: { code: '0121', name: 'Remuneracion basica', kind: 'INGRESO' },
  FAMILY_ALLOWANCE: { code: '0201', name: 'Asignacion familiar', kind: 'INGRESO' },
  OVERTIME: { code: '0302', name: 'Horas extras', kind: 'INGRESO' },
  BONUSES: { code: '0501', name: 'Bonificaciones', kind: 'INGRESO' },
  ONP: { code: '0601', name: 'Sistema Nacional de Pensiones (ONP)', kind: 'DESCUENTO' },
  AFP_CONTRIBUTION: { code: '0605', name: 'Aporte obligatorio AFP', kind: 'DESCUENTO' },
  AFP_COMMISSION: { code: '0606', name: 'Comision AFP', kind: 'DESCUENTO' },
  AFP_INSURANCE: { code: '0607', name: 'Prima de seguro AFP', kind: 'DESCUENTO' },
  INCOME_TAX: { code: '0701', name: 'Renta de quinta categoria', kind: 'DESCUENTO' },
  OTHER_DEDUCTIONS: { code: '0799', name: 'Otros descuentos', kind: 'DESCUENTO' },
  ESSALUD: { code: '0804', name: 'EsSalud - regimen regular', kind: 'APORTE_EMPLEADOR' },
  SCTR: { code: '0806', name: 'EsSalud - SCTR', kind: 'APORTE_EMPLEADOR' },
} as const

export type PlameConceptKey = keyof typeof PLAME_CONCEPTS

export type PlameFileKind = 'JORNADA' | 'CONCEPTOS'

export interface PlameField {
  position: number
  key: string
  label: string
  format: 'text' | 'number' | 'integer' | 'hours'
  required?: boolean
  maxLength?: number
}

export interface PlameFileLayout {
  kind: PlameFileKind
  /** Extension del archivo que espera el PDT. */
  extension: string
  name: string
  version: string
  fields: PlameField[]
}

/**
 * Jornada laboral: dias y horas de cada trabajador en el periodo.
 * Es lo que sustenta el prorrateo y el calculo de sobretiempo.
 */
export const JORNADA_FILE: PlameFileLayout = {
  kind: 'JORNADA',
  extension: 'jor',
  name: 'Jornada laboral',
  version: PLAME_LAYOUT_VERSION,
  fields: [
    { position: 1, key: 'docType', label: 'Tipo de documento del trabajador', format: 'text', required: true, maxLength: 2 },
    { position: 2, key: 'docNumber', label: 'Numero de documento', format: 'text', required: true, maxLength: 15 },
    { position: 3, key: 'workedDays', label: 'Dias laborados', format: 'integer', required: true },
    { position: 4, key: 'subsidizedDays', label: 'Dias subsidiados', format: 'integer' },
    { position: 5, key: 'nonWorkedDays', label: 'Dias no laborados y no subsidiados', format: 'integer' },
    { position: 6, key: 'ordinaryHours', label: 'Horas ordinarias', format: 'hours' },
    { position: 7, key: 'overtimeHours', label: 'Horas de sobretiempo', format: 'hours' },
  ],
}

/**
 * Conceptos: una linea por trabajador y concepto con importe distinto de cero.
 * Es el detalle que alimenta las bases de aportes y retenciones.
 */
export const CONCEPTOS_FILE: PlameFileLayout = {
  kind: 'CONCEPTOS',
  extension: 'rem',
  name: 'Conceptos remunerativos',
  version: PLAME_LAYOUT_VERSION,
  fields: [
    { position: 1, key: 'docType', label: 'Tipo de documento del trabajador', format: 'text', required: true, maxLength: 2 },
    { position: 2, key: 'docNumber', label: 'Numero de documento', format: 'text', required: true, maxLength: 15 },
    { position: 3, key: 'conceptCode', label: 'Codigo del concepto', format: 'text', required: true, maxLength: 4 },
    { position: 4, key: 'amount', label: 'Monto', format: 'number', required: true },
  ],
}

export const PLAME_FILES: Record<PlameFileKind, PlameFileLayout> = {
  JORNADA: JORNADA_FILE,
  CONCEPTOS: CONCEPTOS_FILE,
}
