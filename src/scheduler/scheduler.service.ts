import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RemindersService } from '../reminders/reminders.service';
import dayjs from 'dayjs';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly remindersService: RemindersService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkReminders() {
    const now = dayjs();
    const currentTime = now.format('HH:mm');

    try {
      const reminders = await this.remindersService.findDueReminders(currentTime);

      for (const reminder of reminders) {
        this.logger.log(`Reminder due for habit: ${reminder.habit.title}`);
      }
    } catch (error) {
      this.logger.error('Error checking reminders', error);
    }
  }
}
