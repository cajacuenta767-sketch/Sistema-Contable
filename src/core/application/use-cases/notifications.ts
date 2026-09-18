import type { AuthenticatedUser } from '@/core/domain/types'
import type { NotificationRecord, NotificationRepository } from '../ports'

/** Bandeja in-app. Sin correo ni WhatsApp por decision de alcance. */
export class NotificationUseCases {
  constructor(private readonly notifications: NotificationRepository) {}

  async inbox(
    user: AuthenticatedUser,
    limit = 20,
  ): Promise<{ items: NotificationRecord[]; unread: number }> {
    const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit)))
    const [items, unread] = await Promise.all([
      this.notifications.listForUser(user.id, safeLimit),
      this.notifications.countUnread(user.id),
    ])
    return { items, unread }
  }

  /** El userId va en el WHERE: nadie marca como leida la alerta de otro. */
  async markRead(user: AuthenticatedUser, notificationId: string): Promise<void> {
    await this.notifications.markRead(user.id, notificationId)
  }

  async markAllRead(user: AuthenticatedUser): Promise<number> {
    return this.notifications.markAllRead(user.id)
  }
}
