import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { HabitsModule } from '../habits/habits.module';

@Module({
  imports: [HabitsModule],
  providers: [RemindersService],
  controllers: [RemindersController],
  exports: [RemindersService],
})
export class RemindersModule {}
