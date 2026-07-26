import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [RemindersModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
