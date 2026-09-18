'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ApiError, api } from '@/lib/api-client'
import { documentTypeOptions, identityTypeOptions } from '@/lib/catalogs'

/**
 * Alta de comprobante.
 *
 * El formulario calcula el IGV y el total mientras se escribe, pero ese
 * calculo es SOLO una ayuda visual: el servidor recalcula y rechaza el
 * comprobante si la base, el IGV y el total no son coherentes. Nunca se
 * confia en una cifra que llego del navegador.
 *
 * El calculo del navegador usa `number` y por eso puede diferir en un centimo
 * del definitivo; el backend trabaja con aritmetica exacta.
 */
export function NewDocumentButton({
  clientId,
  period,
}: {
  clientId: string
  period: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const [kind, setKind] = useState<'VENTA' | 'COMPRA'>('VENTA')
  const [base, setBase] = useState('')
  const [exempt, setExempt] = useState('')

  // Vista previa: base x 18% y total. Solo orientativo.
  const preview = useMemo(() => {
    const baseValue = Number(base) || 0
    const exemptValue = Number(exempt) || 0
    const igv = Math.round(baseValue * 0.18 * 100) / 100
    return { igv, total: Math.round((baseValue + exemptValue + igv) * 100) / 100 }
  }, [base, exempt])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setFormError(null)
    setLoading(true)

    const form = new FormData(event.currentTarget)
    const payload = {
      clientId,
      period,
      kind,
      docType: String(form.get('docType') ?? '01'),
      serie: String(form.get('serie') ?? '').trim(),
      number: String(form.get('number') ?? '').trim(),
      issueDate: String(form.get('issueDate') ?? ''),
      counterpartyDocType: String(form.get('counterpartyDocType') ?? '6'),
      counterpartyDocNumber: String(form.get('counterpartyDocNumber') ?? '').trim(),
      counterpartyName: String(form.get('counterpartyName') ?? '').trim(),
      currency: String(form.get('currency') ?? 'PEN'),
      exchangeRate: String(form.get('exchangeRate') ?? '1'),
      taxableBase: String(form.get('taxableBase') ?? '0') || '0',
      exemptAmount: String(form.get('exemptAmount') ?? '0') || '0',
      igv: String(form.get('igv') ?? '0') || '0',
      total: String(form.get('total') ?? '0') || '0',
      notes: String(form.get('notes') ?? '').trim() || null,
    }

    try {
      const result = await api.post<{ warnings: string[] }>(
        '/api/accounting/documents',
        payload,
      )
      toast.push('Comprobante registrado y asentado', 'success')
      for (const warning of result.warnings ?? []) toast.push(warning, 'info')
      setOpen(false)
      setBase('')
      setExempt('')
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
      <Button onClick={() => setOpen(true)}>Registrar comprobante</Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Registrar comprobante"
        description="Al guardarlo se genera su asiento contable en borrador."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" form="form-comprobante" loading={loading}>
              Guardar
            </Button>
          </>
        }
      >
        <form id="form-comprobante" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-[color-mix(in_srgb,var(--status-critical)_40%,transparent)] bg-[color-mix(in_srgb,var(--status-critical)_10%,transparent)] px-3 py-2 text-sm text-[var(--status-critical)]"
            >
              {formError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Operacion"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'VENTA' | 'COMPRA')}
              options={[
                { value: 'VENTA', label: 'Venta' },
                { value: 'COMPRA', label: 'Compra' },
              ]}
            />
            <Select
              label="Tipo de comprobante"
              name="docType"
              defaultValue="01"
              options={documentTypeOptions()}
              error={errors.docType}
            />
            <Input label="Fecha de emision" name="issueDate" type="date" required error={errors.issueDate} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Serie" name="serie" required placeholder="F001" error={errors.serie} />
            <Input label="Numero" name="number" required placeholder="1234" error={errors.number} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Documento"
              name="counterpartyDocType"
              defaultValue="6"
              options={identityTypeOptions()}
              error={errors.counterpartyDocType}
            />
            <Input
              label="Numero"
              name="counterpartyDocNumber"
              required
              inputMode="numeric"
              error={errors.counterpartyDocNumber}
            />
            <Select
              label="Moneda"
              name="currency"
              defaultValue="PEN"
              options={[
                { value: 'PEN', label: 'Soles' },
                { value: 'USD', label: 'Dolares' },
              ]}
            />
          </div>

          <Input
            label={kind === 'VENTA' ? 'Cliente' : 'Proveedor'}
            name="counterpartyName"
            required
            error={errors.counterpartyName}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Base imponible"
              name="taxableBase"
              inputMode="decimal"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="0.00"
              error={errors.taxableBase}
            />
            <Input
              label="Operaciones exoneradas"
              name="exemptAmount"
              inputMode="decimal"
              value={exempt}
              onChange={(e) => setExempt(e.target.value)}
              placeholder="0.00"
              error={errors.exemptAmount}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="IGV"
              name="igv"
              inputMode="decimal"
              defaultValue=""
              key={`igv-${preview.igv}`}
              placeholder={preview.igv.toFixed(2)}
              hint="Se sugiere el 18% de la base"
              error={errors.igv}
            />
            <Input
              label="Total"
              name="total"
              inputMode="decimal"
              key={`total-${preview.total}`}
              placeholder={preview.total.toFixed(2)}
              required
              error={errors.total}
            />
            <Input
              label="Tipo de cambio"
              name="exchangeRate"
              inputMode="decimal"
              defaultValue="1"
              hint="Solo si la moneda no es soles"
              error={errors.exchangeRate}
            />
          </div>

          <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Sugerencia de calculo: IGV {preview.igv.toFixed(2)} · Total {preview.total.toFixed(2)}.
            El servidor verifica que base, IGV y total sean coherentes antes de aceptar.
          </p>

          <Textarea label="Observaciones" name="notes" rows={2} error={errors.notes} />
        </form>
      </Modal>
    </>
  )
}
