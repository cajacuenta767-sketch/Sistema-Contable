/**
 * Catalogos de SUNAT usados en la interfaz.
 *
 * Se incluyen los codigos de uso habitual, no los catalogos completos. Estan
 * aqui y no en la base porque son estables (cambian de forma excepcional) y
 * porque la interfaz los necesita para mostrar etiquetas sin una consulta
 * adicional en cada fila.
 */

/** Catalogo 10: tipo de comprobante de pago. */
export const DOCUMENT_TYPES: Record<string, string> = {
  '01': 'Factura',
  '03': 'Boleta de venta',
  '07': 'Nota de credito',
  '08': 'Nota de debito',
  '12': 'Ticket de maquina registradora',
  '14': 'Recibo de servicios publicos',
  '20': 'Comprobante de retencion',
  '40': 'Comprobante de percepcion',
  '50': 'Declaracion unica de aduanas',
}

/** Catalogo 6: tipo de documento de identidad. */
export const IDENTITY_TYPES: Record<string, string> = {
  '0': 'Sin documento',
  '1': 'DNI',
  '4': 'Carnet de extranjeria',
  '6': 'RUC',
  '7': 'Pasaporte',
  'A': 'Cedula diplomatica',
}

export function documentTypeOptions() {
  return Object.entries(DOCUMENT_TYPES).map(([value, label]) => ({ value, label }))
}

export function identityTypeOptions() {
  return Object.entries(IDENTITY_TYPES)
    .filter(([value]) => ['1', '4', '6', '7'].includes(value))
    .map(([value, label]) => ({ value, label }))
}

export const AFP_OPTIONS = [
  { value: 'INTEGRA', label: 'AFP Integra' },
  { value: 'PRIMA', label: 'Prima AFP' },
  { value: 'PROFUTURO', label: 'Profuturo AFP' },
  { value: 'HABITAT', label: 'AFP Habitat' },
]
