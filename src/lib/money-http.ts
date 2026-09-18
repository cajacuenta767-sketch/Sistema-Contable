import { Money } from '@/core/domain/value-objects/money'

/**
 * Serializacion de importes en la API.
 *
 * Los importes salen como CADENA ("1234.56"), no como `number`. Un JSON con
 * `1234.56` obliga al cliente a parsearlo como double, y a partir de ahi
 * cualquier suma en el navegador vuelve a introducir el error de punto
 * flotante que todo el backend evita. La cadena obliga a tratar el importe
 * como lo que es: un dato exacto que se muestra, no que se recalcula.
 */
export function serializeMoney(value: Money | null | undefined): string | null {
  return value ? value.toString() : null
}

/** Convierte recursivamente los Money de un objeto a cadena. */
export function serialize<T>(value: T): unknown {
  if (value instanceof Money) return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = serialize(item)
    return out
  }
  return value
}

export function parseMoney(value: string | number | null | undefined): Money {
  if (value === null || value === undefined || value === '') return Money.zero()
  return typeof value === 'number' ? Money.fromNumber(value) : Money.fromString(value)
}

export function parseMoneyOrNull(value: string | number | null | undefined): Money | null {
  return value === null || value === undefined || value === '' ? null : parseMoney(value)
}
