'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ApiError, api } from '@/lib/api-client'
import { AFP_OPTIONS, identityTypeOptions } from '@/lib/catalogs'

export function NewEmployeeButton({ clientId }: { clientId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pensionSystem, setPensionSystem] = useState<'ONP' | 'AFP'>('ONP')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setFormError(null)
    setLoading(true)

    const form = new FormData(event.currentTarget)
    const payload = {
      clientId,
      docType: String(form.get('docType') ?? '1'),
      docNumber: String(form.get('docNumber') ?? '').trim(),
      firstName: String(form.get('firstName') ?? '').trim(),
      lastName: String(form.get('lastName') ?? '').trim(),
      position: String(form.get('position') ?? '').trim() || null,
      contractType: String(form.get('contractType') ?? 'INDEFINIDO'),
      hireDate: String(form.get('hireDate') ?? ''),
      basicSalary: String(form.get('basicSalary') ?? '0'),
      familyAllowance: form.get('familyAllowance') === 'on',
      pensionSystem,
      afpCode: pensionSystem === 'AFP' ? String(form.get('afpCode') ?? '') : null,
      commissionType: String(form.get('commissionType') ?? 'FLUJO'),
      healthSystem: 'ESSALUD',
      highRisk: form.get('highRisk') === 'on',
    }

    try {
      await api.post('/api/payroll/employees', payload)
      toast.push('Trabajador registrado', 'success')
      setOpen(false)
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
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Nuevo trabajador
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar trabajador"
        description="Los datos previsionales definen los descuentos de su boleta."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" form="form-trabajador" loading={loading}>
              Guardar
            </Button>
          </>
        }
      >
        <form id="form-trabajador" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-[color-mix(in_srgb,var(--status-critical)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-critical)_10%,transparent)] px-3 py-2 text-sm text-[var(--status-critical)]"
            >
              {formError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombres" name="firstName" required error={errors.firstName} />
            <Input label="Apellidos" name="lastName" required error={errors.lastName} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Documento"
              name="docType"
              defaultValue="1"
              options={identityTypeOptions()}
            />
            <Input label="Numero" name="docNumber" required inputMode="numeric" error={errors.docNumber} />
            <Input label="Fecha de ingreso" name="hireDate" type="date" required error={errors.hireDate} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Cargo" name="position" error={errors.position} />
            <Select
              label="Tipo de contrato"
              name="contractType"
              defaultValue="INDEFINIDO"
              options={[
                { value: 'INDEFINIDO', label: 'Indefinido' },
                { value: 'PLAZO_FIJO', label: 'Plazo fijo' },
                { value: 'TIEMPO_PARCIAL', label: 'Tiempo parcial' },
                { value: 'LOCACION', label: 'Locacion de servicios' },
              ]}
            />
            <Input
              label="Remuneracion basica"
              name="basicSalary"
              required
              inputMode="decimal"
              placeholder="0.00"
              error={errors.basicSalary}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Sistema de pensiones"
              name="pensionSystem"
              value={pensionSystem}
              onChange={(e) => setPensionSystem(e.target.value as 'ONP' | 'AFP')}
              options={[
                { value: 'ONP', label: 'ONP' },
                { value: 'AFP', label: 'AFP' },
              ]}
            />
            {pensionSystem === 'AFP' && (
              <>
                <Select label="AFP" name="afpCode" options={AFP_OPTIONS} error={errors.afpCode} />
                <Select
                  label="Comision"
                  name="commissionType"
                  defaultValue="FLUJO"
                  options={[
                    { value: 'FLUJO', label: 'Sobre el flujo' },
                    { value: 'MIXTA', label: 'Mixta' },
                  ]}
                />
              </>
            )}
          </div>

          <div className="space-y-2 rounded-lg bg-[var(--surface-2)] p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="familyAllowance" className="size-4 rounded" />
              Percibe asignacion familiar (10% de la remuneracion minima)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="highRisk" className="size-4 rounded" />
              Realiza trabajo de riesgo (obliga al SCTR)
            </label>
          </div>
        </form>
      </Modal>
    </>
  )
}
