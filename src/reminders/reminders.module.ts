import { Module, forwardRef } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { HabitsModule } from '../habits/habits.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [HabitsModule, forwardRef(() => TelegramModule), CommonModule],
  providers: [RemindersService],
  controllers: [RemindersController],
  exports: [RemindersService],
})
export class RemindersModule {}
