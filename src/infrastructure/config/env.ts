import { z } from 'zod'

/**
 * Configuracion validada al arrancar.
 *
 * Si falta AUTH_SECRET la app debe morir en el arranque, no en el primer
 * login de un usuario en produccion.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET debe tener al menos 32 caracteres'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28_800),
  CRON_SECRET: z.string().min(16).optional(),
  BUSINESS_TIMEZONE: z.string().default('America/Lima'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type Env = z.infer<typeof schema>

let cached: Env | null = null

export function getEnv(): Env {
  if (cached) return cached
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Configuracion invalida:\n${issues}`)
  }
  cached = parsed.data
  return cached
}
