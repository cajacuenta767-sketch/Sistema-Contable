'use client'

/**
 * Cliente HTTP del navegador.
 *
 * Un solo lugar que sabe como luce un error de esta API. Sin esto, cada
 * formulario reimplementa `if (!response.ok)` y termina mostrando
 * "[object Object]" al usuario.
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Errores de validacion del servidor mapeados por campo, para los formularios. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {}
    const out: Record<string, string> = {}
    for (const item of this.details) {
      if (item && typeof item === 'object' && 'field' in item && 'message' in item) {
        out[String(item.field)] = String(item.message)
      }
    }
    return out
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    // Distinguir "no hay red" de "el servidor dijo que no" importa: el mensaje
    // al usuario y la accion sugerida son distintos.
    throw new ApiError('NETWORK_ERROR', 'No se pudo conectar con el servidor', 0)
  }

  if (response.status === 401) {
    // La sesion expiro mientras el usuario trabajaba. Se lo lleva al login
    // conservando a donde queria volver.
    const next = encodeURIComponent(window.location.pathname)
    window.location.href = `/login?next=${next}`
    throw new ApiError('UNAUTHORIZED', 'Sesion expirada', 401)
  }

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? 'Ocurrio un error inesperado',
      response.status,
      body?.error?.details,
    )
  }

  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
}
