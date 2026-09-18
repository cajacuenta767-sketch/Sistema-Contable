import { readJson, searchParamsToObject, withErrorHandling, jsonOk } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { pleBookSchema } from '@/lib/validation'
import { serialize } from '@/lib/money-http'
import { getContainer } from '@/infrastructure/container'
import { PleGenerator } from '@/core/domain/accounting/ple/generator'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Un libro de un mes con miles de comprobantes puede pasar del limite por
// defecto de 10 segundos.
export const maxDuration = 120

/** Historial de generaciones. */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, period } = z
    .object({
      clientId: z.string().min(1),
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    })
    .parse(searchParamsToObject(request.url))

  const items = await getContainer().accountingReports.listPleExports(user, clientId, period)
  return jsonOk(serialize({ items }))
})

/**
 * Genera el libro y lo devuelve como archivo descargable.
 *
 * Se entrega en Latin-1, que es la codificacion que espera el validador de
 * SUNAT; enviarlo en UTF-8 hace que las razones sociales con enie o tilde
 * lleguen corruptas.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const input = pleBookSchema.parse(await readJson(request))

  const file = await getContainer().accountingReports.generatePleBook(user, input)
  const buffer = PleGenerator.toBuffer(file.content)

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=iso-8859-1',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      // Metadatos utiles para la UI sin tener que leer el cuerpo.
      'X-Ple-Lines': String(file.lineCount),
      'X-Ple-Layout-Version': file.layoutVersion,
      'X-Ple-Warnings': encodeURIComponent(JSON.stringify(file.warnings)),
    },
  })
})
