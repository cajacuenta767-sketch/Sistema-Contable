import { Prisma } from '@prisma/client'
import { Money, type Currency } from '@/core/domain/value-objects/money'

/**
 * Conversion Decimal (Prisma) <-> Money (dominio).
 *
 * Siempre a traves de la representacion en CADENA, nunca de `number`.
 * `decimal.toNumber()` pasaria el valor por punto flotante justo en la
 * frontera, que es donde mas caro sale: un importe leido de la base y vuelto
 * a grabar podria cambiar de valor.
 */

export function toMoney(
  value: Prisma.Decimal | null | undefined,
  currency: Currency = 'PEN',
): Money {
  if (value === null || value === undefined) return Money.zero(currency)
  return Money.fromString(value.toString(), currency)
}

export function toMoneyOrNull(
  value: Prisma.Decimal | null | undefined,
  currency: Currency = 'PEN',
): Money | null {
  return value === null || value === undefined ? null : toMoney(value, currency)
}

export function toDecimal(value: Money): Prisma.Decimal {
  return new Prisma.Decimal(value.toString())
}

export function toDecimalOrNull(value: Money | null | undefined): Prisma.Decimal | null {
  return value ? toDecimal(value) : null
}

/** Tasas y tipos de cambio: se guardan como Decimal y viajan como cadena. */
export function rateToString(value: Prisma.Decimal | null | undefined): string {
  return value === null || value === undefined ? '0' : value.toString()
}
