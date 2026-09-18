'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { ApiError, api } from '@/lib/api-client'

export function CommentForm({ taskId }: { taskId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!text) return

    setLoading(true)
    try {
      await api.post(`/api/tasks/${taskId}/comments`, { body: text })
      setBody('')
      router.refresh()
    } catch (error) {
      toast.push(
        error instanceof ApiError ? error.message : 'No se pudo publicar el comentario',
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        label="Agregar comentario"
        hideLabel
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Escriba un comentario para el equipo..."
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          loading={loading}
          loadingLabel="Publicando comentario"
          disabled={!body.trim()}
        >
          Comentar
        </Button>
      </div>
    </form>
  )
}
