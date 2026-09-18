'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ApiError, api } from '@/lib/api-client'

/**
 * Alta de cliente.
 *
 * El RUC se valida del lado del servidor (digito verificador incluido) y el
 * error vuelve mapeado al campo. No se duplica el algoritmo en el navegador:
 * una sola fuente de verdad evita que las dos versiones se desincronicen.
 */
export function NewClientButton() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setFormError(null)
    setLoading(true)

    const form = new FormData(event.currentTarget)
    const payload = {
      ruc: String(form.get('ruc') ?? '').trim(),
      businessName: String(form.get('businessName') ?? '').trim(),
      tradeName: String(form.get('tradeName') ?? '').trim() || null,
      taxRegime: String(form.get('taxRegime') ?? 'GENERAL'),
      contactName: String(form.get('contactName') ?? '').trim() || null,
      contactPhone: String(form.get('contactPhone') ?? '').trim() || null,
      contactEmail: String(form.get('contactEmail') ?? '').trim() || null,
      notes: String(form.get('notes') ?? '').trim() || null,
    }

    try {
      await api.post('/api/clients', payload)
      toast.push('Cliente registrado correctamente', 'success')
      setOpen(false)
      // refresh() revalida el Server Component del listado: la tabla se
      // actualiza sin recargar toda la pagina ni duplicar el fetch en cliente.
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors
        if (Object.keys(fields).length > 0) setErrors(fields)
        else setFormError(error.message)
      } else {
        setFormError('Ocurrio un error inesperado')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} iconLeft={<PlusIcon />}>
        Nuevo cliente
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar cliente"
        description="Los datos tributarios definen los vencimientos automaticos."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" form="form-nuevo-cliente" loading={loading} loadingLabel="Guardando cliente">
              Guardar cliente
            </Button>
          </>
        }
      >
        <form id="form-nuevo-cliente" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-[color-mix(in_srgb,var(--status-critical)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-critical)_10%,transparent)] px-3 py-2 text-sm text-[var(--status-critical)]"
            >
              {formError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="RUC"
              name="ruc"
              required
              inputMode="numeric"
              maxLength={11}
              placeholder="20123456789"
              error={errors.ruc}
              hint="11 digitos. Define el cronograma de vencimientos."
            />
            <Select
              label="Regimen tributario"
              name="taxRegime"
              required
              defaultValue="GENERAL"
              error={errors.taxRegime}
              options={[
                { value: 'NRUS', label: 'NRUS' },
                { value: 'RER', label: 'RER' },
                { value: 'MYPE', label: 'MYPE Tributario' },
                { value: 'GENERAL', label: 'Regimen General' },
              ]}
            />
          </div>

          <Input label="Razon social" name="businessName" required error={errors.businessName} />
          <Input label="Nombre comercial" name="tradeName" error={errors.tradeName} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Persona de contacto" name="contactName" error={errors.contactName} />
            <Input label="Telefono" name="contactPhone" type="tel" error={errors.contactPhone} />
          </div>

          <Input label="Correo de contacto" name="contactEmail" type="email" error={errors.contactEmail} />
          <Textarea label="Observaciones" name="notes" rows={3} error={errors.notes} />
        </form>
      </Modal>
    </>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none">
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
