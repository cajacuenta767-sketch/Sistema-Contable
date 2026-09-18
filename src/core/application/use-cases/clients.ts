import { ConflictError, NotFoundError, ValidationError } from '@/core/domain/errors'
import { Permissions } from '@/core/domain/services/permissions'
import type { AuthenticatedUser } from '@/core/domain/types'
import { Ruc } from '@/core/domain/value-objects/ruc'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type AuditLogRepository,
  type ClientFilters,
  type ClientListItem,
  type ClientRecord,
  type ClientRepository,
  type Clock,
  type CreateClientInput,
  type Page,
  type PageParams,
  type UpdateClientInput,
} from '../ports'

export class ClientUseCases {
  constructor(
    private readonly clients: ClientRepository,
    private readonly audit: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  async list(
    user: AuthenticatedUser,
    filters: ClientFilters,
    page: Partial<PageParams>,
  ): Promise<Page<ClientListItem>> {
    // Un contador o asistente solo ve su cartera. El filtro se fuerza aqui,
    // en el nucleo, y no en el endpoint: asi ninguna ruta nueva puede
    // "olvidarse" de aplicarlo.
    const scoped: ClientFilters = Permissions.canSeeEverything(user.role)
      ? filters
      : { ...filters, accountantId: user.id }

    return this.clients.list(scoped, normalizePage(page), this.clock.now())
  }

  async getById(user: AuthenticatedUser, id: string): Promise<ClientRecord> {
    const client = await this.clients.findById(id)
    if (!client) throw new NotFoundError('el cliente', id)

    if (!Permissions.canSeeEverything(user.role) && client.accountantId !== user.id) {
      throw new NotFoundError('el cliente', id) // 404 y no 403: no revela su existencia
    }
    return client
  }

  async create(user: AuthenticatedUser, input: Omit<CreateClientInput, 'rucLastDigit'>): Promise<ClientRecord> {
    Permissions.assert(user, 'client:write')

    // El value object valida el digito verificador y deriva el ultimo digito,
    // que es lo que gobierna todos los vencimientos del cliente.
    const ruc = Ruc.create(input.ruc)

    const existing = await this.clients.findByRuc(ruc.value)
    if (existing) {
      throw new ConflictError(`Ya existe un cliente con el RUC ${ruc.value}`, {
        clientId: existing.id,
      })
    }

    if (!input.businessName?.trim()) {
      throw new ValidationError('La razon social es obligatoria')
    }

    const created = await this.clients.create({
      ...input,
      ruc: ruc.value,
      rucLastDigit: ruc.lastDigit,
      businessName: input.businessName.trim(),
      // Un contador que crea un cliente queda como responsable por defecto.
      accountantId: input.accountantId ?? (user.role === 'CONTADOR' ? user.id : null),
    })

    await this.audit.record({
      action: 'client.create',
      entity: 'Client',
      entityId: created.id,
      userId: user.id,
      metadata: { ruc: created.ruc, businessName: created.businessName },
    })

    return created
  }

  async update(user: AuthenticatedUser, id: string, input: UpdateClientInput): Promise<ClientRecord> {
    Permissions.assert(user, 'client:write')
    const current = await this.getById(user, id) // valida existencia y alcance

    if (input.status === 'ARCHIVED') {
      Permissions.assert(user, 'client:archive')
    }

    const updated = await this.clients.update(id, input)

    await this.audit.record({
      action: 'client.update',
      entity: 'Client',
      entityId: id,
      userId: user.id,
      metadata: { changes: diff({ ...current }, input) },
    })

    return updated
  }
}

export function normalizePage(page: Partial<PageParams>): PageParams {
  const requested = page.pageSize ?? DEFAULT_PAGE_SIZE
  return {
    page: Math.max(1, Math.trunc(page.page ?? 1)),
    // Tope duro: un cliente de la API no puede pedir pageSize=100000 y tumbar
    // la base.
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(requested))),
  }
}

/** Diff superficial para la auditoria: solo lo que realmente cambio. */
function diff(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
) {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const [key, value] of Object.entries(after)) {
    if (value !== undefined && before[key] !== value) {
      changes[key] = { from: before[key] ?? null, to: value }
    }
  }
  return changes
}
