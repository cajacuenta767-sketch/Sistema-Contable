import { ValidationError } from '@/core/domain/errors'
import { Permissions } from '@/core/domain/services/permissions'
import type { AuthenticatedUser } from '@/core/domain/types'
import type { AuditLogRepository, TemplateRecord, TemplateRepository } from '../ports'

/**
 * Plantillas de tareas recurrentes.
 *
 * Son la configuracion que gobierna la generacion mensual: de aqui salen las
 * ~1000 tareas de cada periodo. Por eso la validacion de coherencia vive en el
 * caso de uso y no solo en el esquema de entrada: una plantilla mal formada no
 * falla al guardarse, falla un mes despues, en medio del job, para 200
 * clientes a la vez.
 */
export class TemplateUseCases {
  constructor(
    private readonly templates: TemplateRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  async list(user: AuthenticatedUser): Promise<TemplateRecord[]> {
    Permissions.assert(user, 'task:read:all')
    return this.templates.listActive()
  }

  async create(user: AuthenticatedUser, input: Omit<TemplateRecord, 'id'>): Promise<TemplateRecord> {
    Permissions.assert(user, 'template:write')
    assertCoherent(input)

    const created = await this.templates.create(input)

    await this.audit.record({
      action: 'template.create',
      entity: 'TaskTemplate',
      entityId: created.id,
      userId: user.id,
      metadata: { name: created.name, recurrence: created.recurrence },
    })

    return created
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    input: Partial<Omit<TemplateRecord, 'id'>>,
  ): Promise<TemplateRecord> {
    Permissions.assert(user, 'template:write')

    const current = await this.templates.findById(id)
    if (!current) throw new ValidationError('La plantilla indicada no existe', { id })

    // Se valida el resultado de aplicar el cambio, no el cambio suelto: un
    // PATCH que solo cambia `dueDateRule` puede dejar la plantilla incoherente
    // con un `dueDayOfMonth` que ya estaba guardado.
    assertCoherent({ ...current, ...input })

    const updated = await this.templates.update(id, input)

    await this.audit.record({
      action: 'template.update',
      entity: 'TaskTemplate',
      entityId: id,
      userId: user.id,
      metadata: { changes: input },
    })

    return updated
  }
}

/** Reglas de coherencia entre la regla de vencimiento y sus parametros. */
export function assertCoherent(template: Pick<
  TemplateRecord,
  'dueDateRule' | 'dueDayOfMonth' | 'fixedDueDate' | 'recurrence'
>): void {
  if (template.dueDateRule === 'DAY_OF_MONTH') {
    const day = template.dueDayOfMonth
    if (!day || day < 1 || day > 31) {
      throw new ValidationError(
        'La regla "dia fijo del mes" requiere un dia entre 1 y 31',
        { dueDayOfMonth: day },
      )
    }
  }

  if (template.dueDateRule === 'FIXED_DATE') {
    if (!template.fixedDueDate) {
      throw new ValidationError('La regla "fecha fija" requiere una fecha')
    }
    if (template.recurrence !== 'UNICA') {
      throw new ValidationError(
        'La regla "fecha fija" solo tiene sentido con recurrencia UNICA: una plantilla recurrente con fecha fija generaria todos los periodos con el mismo vencimiento',
      )
    }
  }
}
