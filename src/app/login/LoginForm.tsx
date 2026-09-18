'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Card, CardBody } from '@/components/ui/Card'

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setError(body?.error?.message ?? 'No se pudo iniciar sesion')
        return
      }

      // refresh() antes de push(): invalida el cache del router para que el
      // layout se vuelva a renderizar ya con la sesion. Sin esto, la primera
      // pantalla puede pintarse con los datos del usuario anterior.
      router.refresh()
      router.push(redirectTo)
    } catch {
      setError('No se pudo conectar con el servidor. Revise su conexion.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Correo electronico"
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@estudio.pe"
          />

          <Input
            label="Contrasenia"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            // role=alert para que se anuncie apenas aparece.
            <p
              role="alert"
              className="rounded-lg border border-[color-mix(in_srgb,var(--status-critical)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-critical)_10%,transparent)] px-3 py-2 text-sm text-[var(--status-critical)]"
            >
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} loadingLabel="Verificando credenciales" fullWidth size="lg">
            Ingresar
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
