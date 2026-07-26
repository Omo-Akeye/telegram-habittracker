import { Injectable, Logger, Inject, NotFoundException, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HabitsService } from '../habits/habits.service';
import { TelegramService } from '../telegram/telegram.service';
import dayjs from 'dayjs';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly habitsService: HabitsService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
  ) {}

  async processReminders(userId: number, currentTime: string) {
    const dueReminders = await this.findDue(userId, currentTime);

    for (const reminder of dueReminders) {
      await this.sendWithRetry(reminder);
    }

    const snoozedLogs = await this.findSnoozedDue(userId);

    for (const log of snoozedLogs) {
      await this.reactivateSnoozed(log.id);
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) continue;
      await this.telegramService.sendReminder(user.telegramId, log.reminder.habit, log.reminder.id);
      this.logger.log(`Snoozed reminder re-sent for habit "${log.reminder.habit.title}"`);
    }
  }

  private async sendWithRetry(reminder: any, attempt = 1) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: reminder.habit.userId } });
      if (!user) return;

      await this.telegramService.sendReminder(user.telegramId, reminder.habit, reminder.id);
      await this.logSent(reminder.id, reminder.habitId);
      this.logger.log(`Reminder sent for habit "${reminder.habit.title}" to user ${user.telegramId}`);
    } catch (error) {
      if (attempt < 3) {
        this.logger.warn(`Retry ${attempt} for reminder ${reminder.id}`);
        await this.sendWithRetry(reminder, attempt + 1);
      } else {
        this.logger.error(`Failed to send reminder ${reminder.id} after 3 attempts`, error);
      }
    }
  }

  async create(habitId: number, userId: number, time: string) {
    await this.habitsService.findOne(habitId, userId);

    return this.prisma.reminder.create({
      data: {
        habitId,
        time,
      },
      include: {
        habit: true,
      },
    });
  }

  async findByHabit(habitId: number) {
    return this.prisma.reminder.findMany({
      where: { habitId },
    });
  }

  async findDue(userId: number, currentTime: string) {
    const today = dayjs().format('YYYY-MM-DD');

    return this.prisma.reminder.findMany({
      where: {
        enabled: true,
        time: currentTime,
        habit: {
          userId,
          archived: false,
        },
        logs: {
          none: {
            date: today,
            status: { in: ['SENT', 'COMPLETED', 'SKIPPED', 'EXPIRED'] },
          },
        },
      },
      include: {
        habit: true,
      },
    });
  }

  async findSnoozedDue(userId: number) {
    const now = new Date();
    const today = dayjs().format('YYYY-MM-DD');

    return this.prisma.reminderLog.findMany({
      where: {
        status: 'SNOOZED',
        date: today,
        snoozedUntil: { lte: now },
        reminder: {
          enabled: true,
          habit: {
            userId,
            archived: false,
          },
        },
      },
      include: {
        reminder: {
          include: {
            habit: true,
          },
        },
      },
    });
  }

  async logSent(reminderId: number, habitId: number) {
    const today = dayjs().format('YYYY-MM-DD');

    return this.prisma.reminderLog.create({
      data: {
        reminderId,
        habitId,
        date: today,
        status: 'SENT',
      },
    });
  }

  async markCompleted(logId: number) {
    return this.prisma.reminderLog.update({
      where: { id: logId },
      data: { status: 'COMPLETED' },
    });
  }

  async markSkipped(logId: number) {
    return this.prisma.reminderLog.update({
      where: { id: logId },
      data: { status: 'SKIPPED' },
    });
  }

  async markSnoozed(logId: number, snoozedUntil: Date) {
    return this.prisma.reminderLog.update({
      where: { id: logId },
      data: {
        status: 'SNOOZED',
        snoozedUntil,
      },
    });
  }

  async reactivateSnoozed(logId: number) {
    return this.prisma.reminderLog.update({
      where: { id: logId },
      data: {
        status: 'SENT',
        snoozedUntil: null,
      },
    });
  }

  async markExpired() {
    const twoHoursAgo = dayjs().subtract(2, 'hour').toDate();

    return this.prisma.reminderLog.updateMany({
      where: {
        status: 'SENT',
        sentAt: { lte: twoHoursAgo },
      },
      data: {
        status: 'EXPIRED',
      },
    });
  }

  async getReminder(reminderId: number) {
    return this.prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { habit: true },
    });
  }

  async findTodayLog(reminderId: number) {
    const today = dayjs().format('YYYY-MM-DD');
    return this.prisma.reminderLog.findFirst({
      where: { reminderId, date: today },
      orderBy: { sentAt: 'desc' },
    });
  }

  async toggle(id: number, userId: number) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id },
      include: { habit: true },
    });

    if (!reminder || reminder.habit.userId !== userId) {
      throw new NotFoundException('Reminder not found');
    }

    return this.prisma.reminder.update({
      where: { id },
      data: { enabled: !reminder.enabled },
    });
  }

  async remove(id: number, userId: number) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id },
      include: { habit: true },
    });

    if (!reminder || reminder.habit.userId !== userId) {
      throw new NotFoundException('Reminder not found');
    }

    return this.prisma.reminder.delete({
      where: { id },
    });
  }
}
