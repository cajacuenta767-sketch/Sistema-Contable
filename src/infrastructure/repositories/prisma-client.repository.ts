import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  ClientFilters,
  ClientListItem,
  ClientRecord,
  ClientRepository,
  CreateClientInput,
  Page,
  PageParams,
  UpdateClientInput,
} from '@/core/application/ports'
import type { ClientStatus } from '@/core/domain/types'

const DETAIL_SELECT = {
  id: true,
  ruc: true,
  rucLastDigit: true,
  businessName: true,
  tradeName: true,
  taxRegime: true,
  status: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  address: true,
  monthlyFee: true,
  serviceStart: true,
  notes: true,
  accountantId: true,
  createdAt: true,
  accountant: { select: { fullName: true } },
} as const

type DetailRow = Prisma.ClientGetPayload<{ select: typeof DETAIL_SELECT }>

export class PrismaClientRepository implements ClientRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(filters: ClientFilters, page: PageParams, now: Date): Promise<Page<ClientListItem>> {
    const where = this.buildWhere(filters)
    const skip = (page.page - 1) * page.pageSize

    const [total, rows] = await this.db.$transaction([
      this.db.client.count({ where }),
      this.db.client.findMany({
        where,
        skip,
        take: page.pageSize,
        orderBy: { businessName: 'asc' },
        select: {
          id: true,
          ruc: true,
          businessName: true,
          taxRegime: true,
          status: true,
          accountant: { select: { fullName: true } },
        },
      }),
    ])

    const ids = rows.map((r) => r.id)

    // Contadores agregados en DOS consultas para toda la pagina, no una por
    // fila. Esta es la diferencia entre 3 queries y 2N+1: con pageSize=25 la
    // version ingenua haria 51 viajes a la base por cada carga del listado.
    const [openCounts, overdueCounts] = ids.length
      ? await Promise.all([
          this.db.task.groupBy({
            by: ['clientId'],
            where: { clientId: { in: ids }, status: { not: 'TERMINADA' } },
            _count: { _all: true },
          }),
          this.db.task.groupBy({
            by: ['clientId'],
            where: { clientId: { in: ids }, status: { not: 'TERMINADA' }, dueDate: { lt: now } },
            _count: { _all: true },
          }),
        ])
      : [[], []]

    const openBy = new Map(openCounts.map((c) => [c.clientId, c._count._all]))
    const overdueBy = new Map(overdueCounts.map((c) => [c.clientId, c._count._all]))

    return {
      items: rows.map((r) => ({
        id: r.id,
        ruc: r.ruc,
        businessName: r.businessName,
        taxRegime: r.taxRegime,
        status: r.status,
        accountantName: r.accountant?.fullName ?? null,
        openTasks: openBy.get(r.id) ?? 0,
        overdueTasks: overdueBy.get(r.id) ?? 0,
      })),
      total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
    }
  }

  async findById(id: string): Promise<ClientRecord | null> {
    const row = await this.db.client.findUnique({ where: { id }, select: DETAIL_SELECT })
    return row ? this.toRecord(row) : null
  }

  async findByRuc(ruc: string): Promise<ClientRecord | null> {
    const row = await this.db.client.findUnique({ where: { ruc }, select: DETAIL_SELECT })
    return row ? this.toRecord(row) : null
  }

  async create(input: CreateClientInput): Promise<ClientRecord> {
    const row = await this.db.client.create({
      data: {
        ruc: input.ruc,
        rucLastDigit: input.rucLastDigit,
        businessName: input.businessName,
        tradeName: input.tradeName ?? null,
        taxRegime: input.taxRegime,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        address: input.address ?? null,
        monthlyFee: input.monthlyFee ?? null,
        serviceStart: input.serviceStart ?? null,
        notes: input.notes ?? null,
        accountantId: input.accountantId ?? null,
      },
      select: DETAIL_SELECT,
    })
    return this.toRecord(row)
  }

  async update(id: string, input: UpdateClientInput): Promise<ClientRecord> {
    const row = await this.db.client.update({
      where: { id },
      // `undefined` en Prisma significa "no tocar"; `null` significa "borrar".
      // El spread directo respeta esa semantica sin ifs.
      data: { ...input },
      select: DETAIL_SELECT,
    })
    return this.toRecord(row)
  }

  async listActiveForGeneration() {
    return this.db.client.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        rucLastDigit: true,
        taxRegime: true,
        accountantId: true,
        businessName: true,
      },
    })
  }

  async countByStatus(): Promise<Record<ClientStatus, number>> {
    const rows = await this.db.client.groupBy({ by: ['status'], _count: { _all: true } })
    const base: Record<ClientStatus, number> = { ACTIVE: 0, SUSPENDED: 0, ARCHIVED: 0 }
    for (const row of rows) base[row.status] = row._count._all
    return base
  }

  private buildWhere(filters: ClientFilters): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = {}

    if (filters.status) where.status = filters.status
    else where.status = { not: 'ARCHIVED' } // los archivados no estorban por defecto

    if (filters.taxRegime) where.taxRegime = filters.taxRegime
    if (filters.accountantId) where.accountantId = filters.accountantId

    const search = filters.search?.trim()
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { tradeName: { contains: search, mode: 'insensitive' } },
        { ruc: { startsWith: search } }, // startsWith aprovecha el indice
      ]
    }
    return where
  }

  private toRecord(row: DetailRow): ClientRecord {
    return {
      id: row.id,
      ruc: row.ruc,
      rucLastDigit: row.rucLastDigit,
      businessName: row.businessName,
      tradeName: row.tradeName,
      taxRegime: row.taxRegime,
      status: row.status,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      address: row.address,
      // Decimal de Prisma -> number. Aceptable para un honorario mensual; si
      // algun dia se hace contabilidad, los importes NO deben pasar por number.
      monthlyFee: row.monthlyFee ? Number(row.monthlyFee) : null,
      serviceStart: row.serviceStart,
      notes: row.notes,
      accountantId: row.accountantId,
      accountantName: row.accountant?.fullName ?? null,
      createdAt: row.createdAt,
    }
  }
}
