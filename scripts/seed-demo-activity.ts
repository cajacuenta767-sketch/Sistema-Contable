/**
 * Actividad de ejemplo (SOLO desarrollo).
 *
 * Mueve tareas por la maquina de estados usando los casos de uso reales, no
 * escribiendo en la base a mano. Asi la bitacora, las notificaciones y la
 * auditoria quedan pobladas de forma coherente, y el dashboard de demostracion
 * refleja algo que el sistema podria haber producido de verdad.
 *
 *   npm run demo:activity
 */
import { getContainer } from '../src/infrastructure/container'
import { prisma } from '../src/infrastructure/db/prisma'
import type { AuthenticatedUser } from '../src/core/domain/types'
import type { TaskStatus } from '../src/core/domain/types'

/** Generador con semilla: la demo se ve igual en cada maquina. */
function seededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Este script no debe ejecutarse en produccion.')
    process.exit(1)
  }

  const container = getContainer()
  const random = seededRandom(20260918)

  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' } })
  const byId = new Map(
    users.map((u): [string, AuthenticatedUser] => [
      u.id,
      { id: u.id, email: u.email, fullName: u.fullName, role: u.role },
    ]),
  )

  const admin = users.find((u) => u.role === 'ADMIN')
  if (!admin) throw new Error('No hay administrador. Ejecute primero "npm run db:seed".')
  const adminUser = byId.get(admin.id)!

  const tasks = await prisma.task.findMany({
    where: { status: 'PENDIENTE', assigneeId: { not: null } },
    select: { id: true, assigneeId: true },
  })

  // Reparto objetivo: mayoria terminada, algunas en curso, otras sin empezar.
  const plan: TaskStatus[][] = [
    ['EN_PROCESO', 'EN_REVISION', 'TERMINADA'],
    ['EN_PROCESO', 'EN_REVISION', 'TERMINADA'],
    ['EN_PROCESO', 'EN_REVISION', 'TERMINADA'],
    ['EN_PROCESO', 'EN_REVISION'],
    ['EN_PROCESO'],
    [],
  ]

  let moved = 0
  for (const task of tasks) {
    const steps = plan[Math.floor(random() * plan.length)] ?? []
    // El responsable mueve su tarea; el admin aprueba lo que esta en revision.
    const worker = task.assigneeId ? byId.get(task.assigneeId) : undefined
    if (!worker) continue

    for (const step of steps) {
      const actor = step === 'TERMINADA' ? adminUser : worker
      try {
        await container.tasks.changeStatus(actor, task.id, step)
        moved++
      } catch {
        // Una transicion rechazada (por ejemplo, la tarea ya se movio) no debe
        // cortar la siembra de las demas.
        break
      }
    }
  }

  const counts = await prisma.task.groupBy({ by: ['status'], _count: { _all: true } })
  console.log(`${moved} transiciones aplicadas. Estado final:`)
  for (const row of counts) console.log(`  ${row.status.padEnd(12)} ${row._count._all}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
