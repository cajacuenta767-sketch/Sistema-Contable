import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

/**
 * Middleware de sesion (runtime Edge).
 *
 * Solo verifica que el token exista y este firmado, para redirigir al login
 * antes de renderizar. NO decide permisos: eso se hace en el servidor, en cada
 * caso de uso. Un middleware que autoriza es un middleware que se olvida de
 * autorizar la ruta nueva.
 *
 * Se valida con `jose` y no se consulta la base: el Edge no tiene acceso a
 * Postgres y, sobre todo, un middleware que hace I/O en cada navegacion es un
 * cuello de botella.
 */

const SESSION_COOKIE = 'sc_session'
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/jobs']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const valid = token ? await isValid(token) : false

  if (!valid) {
    // Las rutas de API responden 401; las paginas redirigen al login.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Sesion requerida' } },
        { status: 401 },
      )
    }
    const loginUrl = new URL('/login', request.url)
    // Se preserva el destino para volver ahi despues de autenticarse.
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

async function isValid(token: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET
  if (!secret) return false
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] })
    return true
  } catch {
    return false
  }
}

export const config = {
  // Se excluyen assets estaticos: hacerles pasar por el middleware es costo
  // puro sin beneficio.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
