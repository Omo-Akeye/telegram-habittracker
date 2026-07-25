import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { UsersModule } from '../users/users.module';
import { HabitsModule } from '../habits/habits.module';
import { CompletionsModule } from '../completions/completions.module';
import { StatisticsModule } from '../statistics/statistics.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [
    UsersModule,
    HabitsModule,
    CompletionsModule,
    StatisticsModule,
    RemindersModule,
  ],
  providers: [TelegramService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
