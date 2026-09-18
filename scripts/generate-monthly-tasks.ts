/**
 * Ejecucion del job mensual desde la linea de comandos.
 *
 * Util para desarrollo y para servidores donde el cron llama a un binario en
 * vez de a un endpoint HTTP. La logica es exactamente la misma que usa la
 * ruta /api/jobs/generate-tasks: un solo caso de uso, dos formas de invocarlo.
 *
 *   npm run jobs:generate-tasks          -> periodo anterior al actual
 *   npm run jobs:generate-tasks 2026-08  -> periodo indicado
 */
import { getContainer } from '../src/infrastructure/container'

async function main() {
  const period = process.argv[2]
  const container = getContainer()

  const actorId = await container.resolveSystemActorId()
  if (!actorId) {
    console.error('No hay un administrador activo. Ejecute primero "npm run db:seed".')
    process.exit(1)
  }

  const summary = await container.jobs.generateMonthlyTasks.execute(period, actorId)

  console.log(`Periodo ${summary.period}`)
  console.log(`  plantillas evaluadas : ${summary.templatesEvaluated}`)
  console.log(`  clientes evaluados   : ${summary.clientsEvaluated}`)
  console.log(`  tareas creadas       : ${summary.created}`)
  console.log(`  omitidas (ya existian): ${summary.skipped}`)
  console.log(`  fechas estimadas     : ${summary.estimatedDueDates}`)
  for (const warning of summary.warnings) console.warn(`  aviso: ${warning}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .then(() => process.exit(0))
