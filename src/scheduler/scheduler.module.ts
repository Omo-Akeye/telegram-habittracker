import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { RemindersModule } from '../reminders/reminders.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [RemindersModule, TelegramModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
