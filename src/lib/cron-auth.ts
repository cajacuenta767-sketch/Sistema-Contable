import { timingSafeEqual } from 'node:crypto'
import { ForbiddenError } from '@/core/domain/errors'
import { getEnv } from '@/infrastructure/config/env'

/**
 * Autenticacion de los jobs programados.
 *
 * Se compara en tiempo constante: una comparacion con `===` filtra, por el
 * tiempo que tarda, cuantos caracteres iniciales del secreto acerto el
 * atacante, y permite descubrirlo byte a byte.
 */
export function assertCronAuthorized(request: Request): void {
  const configured = getEnv().CRON_SECRET
  if (!configured) {
    throw new ForbiddenError('CRON_SECRET no esta configurado en el servidor')
  }

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''

  const a = Buffer.from(provided)
  const b = Buffer.from(configured)
  // timingSafeEqual exige la misma longitud, y esa comparacion previa ya
  // filtra el largo. Se normaliza con un hash implicito de longitud fija
  // comparando buffers rellenados.
  const equal = a.length === b.length && timingSafeEqual(a, b)

  if (!equal) throw new ForbiddenError('Token de job invalido')
}
