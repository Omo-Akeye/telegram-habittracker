import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly remindersService: RemindersService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkReminders() {
    try {
      // Optimized: query only users who have active reminders, not all users
      const usersWithReminders = await this.prisma.user.findMany({
        where: {
          habits: {
            some: {
              archived: false,
              reminders: {
                some: {
                  enabled: true,
                },
              },
            },
          },
        },
      });

      for (const user of usersWithReminders) {
        try {
          const userTime = dayjs().tz(user.timezone || 'UTC');
          const currentTime = userTime.format('HH:mm');
          await this.remindersService.processReminders(user.id, currentTime);
        } catch (error) {
          this.logger.error(
            `Error processing reminders for user ${user.id}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      await this.remindersService.markExpired();
    } catch (error) {
      this.logger.error('Error in reminder check cycle', error);
    }
  }
}
