import { Module, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramStateService } from './telegram-state.service';
import { TelegramKeyboardsService } from './telegram-keyboards.service';
import { TelegramCommandsHandler } from './telegram-commands.handler';
import { TelegramCallbacksHandler } from './telegram-callbacks.handler';
import { UsersModule } from '../users/users.module';
import { HabitsModule } from '../habits/habits.module';
import { CompletionsModule } from '../completions/completions.module';
import { StatisticsModule } from '../statistics/statistics.module';
import { RemindersModule } from '../reminders/reminders.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    UsersModule,
    HabitsModule,
    CompletionsModule,
    StatisticsModule,
    forwardRef(() => RemindersModule),
    AuthModule,
  ],
  providers: [
    TelegramService,
    TelegramStateService,
    TelegramKeyboardsService,
    TelegramCommandsHandler,
    TelegramCallbacksHandler,
  ],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
