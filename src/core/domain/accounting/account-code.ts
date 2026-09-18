import { ValidationError } from '../errors'

/**
 * Codigo de cuenta del Plan Contable General Empresarial (PCGE 2019).
 *
 * La estructura es jerarquica y el largo del codigo dice el nivel:
 *   1 digito  -> Elemento          (6 = Gastos por naturaleza)
 *   2 digitos -> Cuenta            (60 = Compras)
 *   3 digitos -> Subcuenta         (601 = Mercaderias)
 *   4 digitos -> Divisionaria      (6011 = Mercaderias manufacturadas)
 *   5+        -> Sub-divisionaria  (definidas por cada empresa)
 *
 * De ahi salen dos cosas que el sistema necesita sin consultar la base:
 * la naturaleza de la cuenta (deudora o acreedora) y a que estado financiero
 * pertenece. Por eso el codigo es un value object y no un simple string.
 */

const CODE_RE = /^\d{1,10}$/

/** Elementos del PCGE y su significado. */
export const ELEMENTS = {
  '0': 'Cuentas de orden',
  '1': 'Activo disponible y exigible',
  '2': 'Activo realizable',
  '3': 'Activo inmovilizado',
  '4': 'Pasivo',
  '5': 'Patrimonio',
  '6': 'Gastos por naturaleza',
  '7': 'Ingresos',
  '8': 'Saldos intermediarios de gestion',
  '9': 'Contabilidad analitica de explotacion',
} as const

export type ElementCode = keyof typeof ELEMENTS

/** Deudora: aumenta por el debe. Acreedora: aumenta por el haber. */
export type AccountNature = 'DEUDORA' | 'ACREEDORA'

/** A que reporte contribuye el saldo de la cuenta. */
export type StatementSection =
  | 'ACTIVO'
  | 'PASIVO'
  | 'PATRIMONIO'
  | 'INGRESO'
  | 'GASTO'
  | 'ORDEN'
  | 'GESTION'

export class AccountCode {
  private constructor(readonly value: string) {}

  static create(input: string): AccountCode {
    const code = input.trim()
    if (!CODE_RE.test(code)) {
      throw new ValidationError(
        `Codigo de cuenta invalido: "${input}". Debe tener entre 1 y 10 digitos.`,
        { code: input },
      )
    }
    return new AccountCode(code)
  }

  static isValid(input: string): boolean {
    return CODE_RE.test(input.trim())
  }

  get element(): ElementCode {
    return this.value[0] as ElementCode
  }

  get elementName(): string {
    return ELEMENTS[this.element]
  }

  /** 1 = elemento, 2 = cuenta, 3 = subcuenta, 4 = divisionaria... */
  get level(): number {
    return this.value.length
  }

  /** Codigo del nivel inmediatamente superior, o null si es un elemento. */
  get parent(): string | null {
    return this.value.length <= 1 ? null : this.value.slice(0, -1)
  }

  /** true si `other` cuelga de esta cuenta (o es ella misma). */
  contains(other: AccountCode): boolean {
    return other.value.startsWith(this.value)
  }

  get nature(): AccountNature {
    // Elementos 1, 2, 3 (activo) y 6 (gastos) son deudores.
    // Elementos 4 (pasivo), 5 (patrimonio) y 7 (ingresos) son acreedores.
    // El 8 y el 9 son de gestion y el 0 de orden: se tratan por convencion
    // como deudores para el balance de comprobacion, donde solo importa que
    // la suma de debe y haber cuadre.
    return ['4', '5', '7'].includes(this.element) ? 'ACREEDORA' : 'DEUDORA'
  }

  get section(): StatementSection {
    switch (this.element) {
      case '1':
      case '2':
      case '3':
        return 'ACTIVO'
      case '4':
        return 'PASIVO'
      case '5':
        return 'PATRIMONIO'
      case '6':
        return 'GASTO'
      case '7':
        return 'INGRESO'
      case '0':
        return 'ORDEN'
      default:
        return 'GESTION'
    }
  }

  /**
   * Las cuentas de resultado (6 y 7) se cancelan al cierre del ejercicio; las
   * de balance (1-5) arrastran saldo al periodo siguiente. Es la distincion
   * que gobierna el asiento de cierre.
   */
  get isResultAccount(): boolean {
    return this.element === '6' || this.element === '7'
  }

  get isBalanceAccount(): boolean {
    return ['1', '2', '3', '4', '5'].includes(this.element)
  }

  toString(): string {
    return this.value
  }
}
