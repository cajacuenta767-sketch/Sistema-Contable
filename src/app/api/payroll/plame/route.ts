import { withErrorHandling, readJson } from '@/lib/http'
import { requireUser } from '@/lib/session'
import { getContainer } from '@/infrastructure/container'
import { PlameGenerator } from '@/core/domain/payroll/plame/generator'
import { NotFoundError } from '@/core/domain/errors'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const schema = z.object({
  clientId: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  kind: z.enum(['JORNADA', 'CONCEPTOS']),
})

/**
 * Genera un archivo de importacion del PDT PLAME.
 *
 * Se entrega en Latin-1, igual que los libros electronicos: el importador del
 * PDT no lee UTF-8 y los nombres con tilde llegarian corruptos.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser()
  const { clientId, period, kind } = schema.parse(await readJson(request))

  const result = await getContainer().payroll.generatePlame(user, clientId, period)
  const file = result.files.find((f) => f.kind === kind)
  if (!file) throw new NotFoundError('el archivo PLAME solicitado', kind)

  const buffer = PlameGenerator.toBuffer(file.content)

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=iso-8859-1',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'X-Plame-Lines': String(file.lineCount),
      'X-Plame-Layout-Version': file.layoutVersion,
      'X-Plame-Warnings': encodeURIComponent(JSON.stringify(result.warnings)),
    },
  })
})
