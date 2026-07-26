import { Module } from '@nestjs/common';
import { HabitsService } from './habits.service';
import { HabitsController } from './habits.controller';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  providers: [HabitsService],
  controllers: [HabitsController],
  exports: [HabitsService],
})
export class HabitsModule {}
