import { describe, expect, it } from 'vitest'
import { assertCoherent } from '@/core/application/use-cases/templates'
import { taskFiltersSchema } from '@/lib/validation'
import { formatDate } from '@/lib/format'
import { ValidationError } from '@/core/domain/errors'
import type { TemplateRecord } from '@/core/application/ports'

type Coherence = Pick<TemplateRecord, 'dueDateRule' | 'dueDayOfMonth' | 'fixedDueDate' | 'recurrence'>

const base: Coherence = {
  dueDateRule: 'SUNAT_MONTHLY',
  dueDayOfMonth: null,
  fixedDueDate: null,
  recurrence: 'MENSUAL',
}

describe('coherencia de plantillas', () => {
  it('acepta la regla del cronograma SUNAT sin parametros extra', () => {
    expect(() => assertCoherent(base)).not.toThrow()
  })

  it('exige un dia valido para la regla de dia fijo del mes', () => {
    expect(() => assertCoherent({ ...base, dueDateRule: 'DAY_OF_MONTH' })).toThrow(ValidationError)
    expect(() =>
      assertCoherent({ ...base, dueDateRule: 'DAY_OF_MONTH', dueDayOfMonth: 32 }),
    ).toThrow(ValidationError)
    expect(() =>
      assertCoherent({ ...base, dueDateRule: 'DAY_OF_MONTH', dueDayOfMonth: 10 }),
    ).not.toThrow()
  })

  it('exige fecha para la regla de fecha fija', () => {
    expect(() =>
      assertCoherent({ ...base, dueDateRule: 'FIXED_DATE', recurrence: 'UNICA' }),
    ).toThrow(ValidationError)
  })

  it('impide una fecha fija en una plantilla recurrente', () => {
    // Generaria todos los periodos con el mismo vencimiento: no tiene sentido.
    expect(() =>
      assertCoherent({
        ...base,
        dueDateRule: 'FIXED_DATE',
        fixedDueDate: new Date('2026-12-31T00:00:00Z'),
        recurrence: 'MENSUAL',
      }),
    ).toThrow(ValidationError)

    expect(() =>
      assertCoherent({
        ...base,
        dueDateRule: 'FIXED_DATE',
        fixedDueDate: new Date('2026-12-31T00:00:00Z'),
        recurrence: 'UNICA',
      }),
    ).not.toThrow()
  })
})

describe('booleanos de query string', () => {
  it('trata "false" como falso', () => {
    // Regresion: z.coerce.boolean() daba `true` para "false", porque toda
    // cadena no vacia es verdadera en JavaScript. Eso hacia que
    // ?overdueOnly=false filtrara por atrasadas.
    const parsed = taskFiltersSchema.parse({ overdueOnly: 'false' })
    expect(parsed.overdueOnly).toBe(false)
  })

  it('trata "true" y "1" como verdadero', () => {
    expect(taskFiltersSchema.parse({ overdueOnly: 'true' }).overdueOnly).toBe(true)
    expect(taskFiltersSchema.parse({ overdueOnly: '1' }).overdueOnly).toBe(true)
  })

  it('rechaza un valor que no sea booleano', () => {
    expect(() => taskFiltersSchema.parse({ overdueOnly: 'quiza' })).toThrow()
  })

  it('aplica los topes de paginacion', () => {
    expect(taskFiltersSchema.parse({ pageSize: '25' }).pageSize).toBe(25)
    expect(() => taskFiltersSchema.parse({ pageSize: '100000' })).toThrow()
  })
})

describe('formato de fechas', () => {
  it('no retrocede un dia al mostrar una fecha sin hora', () => {
    // Regresion: new Date('2026-09-18') es medianoche UTC; mostrada en Lima
    // (UTC-5) caia el 17. Una cadena "YYYY-MM-DD" es un dia de calendario y
    // debe mostrarse tal cual.
    expect(formatDate('2026-09-18')).toContain('18')
    expect(formatDate('2026-01-01')).toContain('01')
    expect(formatDate('2026-01-01')).toContain('2026')
  })

  it('sigue convirtiendo a la zona de Lima los instantes con hora', () => {
    // 04:00Z del 19 es todavia el 18 a las 23:00 en Lima.
    expect(formatDate(new Date('2026-09-19T04:00:00.000Z'))).toContain('18')
  })
})

describe('fechas de calendario en la entrada', () => {
  it('normaliza una fecha sin hora al mediodia UTC', async () => {
    const { createDocumentSchema } = await import('@/lib/validation')
    const parsed = createDocumentSchema.parse({
      clientId: 'c1',
      kind: 'VENTA',
      docType: '01',
      serie: 'F001',
      number: '1',
      issueDate: '2026-08-20',
      counterpartyDocType: '6',
      counterpartyDocNumber: '20100070970',
      counterpartyName: 'Prueba SAC',
      total: '118.00',
    })

    // Regresion: sin normalizar, new Date('2026-08-20') es medianoche UTC y en
    // Lima cae el 19. Una factura del 20 se exportaria al PLE como del 19.
    expect(parsed.issueDate.toISOString()).toBe('2026-08-20T12:00:00.000Z')
    expect(
      parsed.issueDate.toLocaleDateString('es-PE', { timeZone: 'America/Lima' }),
    ).toContain('20')
  })

  it('respeta un instante que ya trae hora', async () => {
    const { createDocumentSchema } = await import('@/lib/validation')
    const parsed = createDocumentSchema.parse({
      clientId: 'c1', kind: 'VENTA', docType: '01', serie: 'F001', number: '1',
      issueDate: '2026-08-20T09:30:00.000Z',
      counterpartyDocType: '6', counterpartyDocNumber: '20100070970',
      counterpartyName: 'Prueba SAC', total: '118.00',
    })
    expect(parsed.issueDate.toISOString()).toBe('2026-08-20T09:30:00.000Z')
  })
})
