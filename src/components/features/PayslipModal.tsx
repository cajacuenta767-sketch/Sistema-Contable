'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface PayslipView {
  basicPay: string
  familyAllowance: string
  overtimePay: string
  bonuses: string
  grossPay: string
  pensionContribution: string
  pensionCommission: string
  pensionInsurance: string
  incomeTax5th: string
  otherDeductions: string
  totalDeductions: string
  netPay: string
  employerEssalud: string
  employerSctr: string
  breakdown: Record<string, string>
}

/**
 * Boleta de pago con el detalle del calculo.
 *
 * El bloque "como se calculo" no es un adorno tecnico: cuando un trabajador
 * reclama su boleta o SUNAFIL pide el sustento, hay que poder mostrar de donde
 * sale cada cifra. Una boleta que solo muestra el neto no se puede defender.
 */
export function PayslipModal({
  employeeName,
  period,
  item,
}: {
  employeeName: string
  period: string
  item: PayslipView
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Ver boleta
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Boleta de ${employeeName}`}
        description={`Periodo ${period}`}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
        }
      >
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Ingresos
            </h3>
            <dl className="space-y-1 text-sm">
              <Row label="Remuneracion basica" value={item.basicPay} />
              <Row label="Asignacion familiar" value={item.familyAllowance} />
              <Row label="Horas extras" value={item.overtimePay} />
              <Row label="Bonificaciones" value={item.bonuses} />
              <Row label="Total ingresos" value={item.grossPay} strong />
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Descuentos
            </h3>
            <dl className="space-y-1 text-sm">
              <Row label="Aporte al fondo de pensiones" value={item.pensionContribution} />
              <Row label="Comision de la AFP" value={item.pensionCommission} />
              <Row label="Prima de seguro" value={item.pensionInsurance} />
              <Row label="Renta de quinta categoria" value={item.incomeTax5th} />
              <Row label="Otros descuentos" value={item.otherDeductions} />
              <Row label="Total descuentos" value={item.totalDeductions} strong />
            </dl>
          </section>

          <section className="rounded-lg bg-[var(--brand-soft)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Neto a pagar</span>
              <span className="text-xl font-semibold tabular-nums">{item.netPay}</span>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Aportes de cargo del empleador
            </h3>
            <dl className="space-y-1 text-sm">
              <Row label="EsSalud" value={item.employerEssalud} />
              <Row label="SCTR" value={item.employerSctr} />
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Como se calculo
            </h3>
            <dl className="space-y-1 rounded-lg bg-[var(--surface-2)] p-3 font-mono text-xs">
              {Object.entries(item.breakdown).map(([key, value]) => (
                <div key={key} className="flex flex-wrap justify-between gap-2">
                  <dt className="text-[var(--text-muted)]">{key.replace(/_/g, ' ')}</dt>
                  <dd className="text-[var(--text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </Modal>
    </>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 ${
        strong ? 'border-t border-[var(--border)] pt-1 font-semibold' : ''
      }`}
    >
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  )
}
