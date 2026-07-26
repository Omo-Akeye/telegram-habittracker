import { Module } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { HabitsModule } from '../habits/habits.module';
import { CompletionsModule } from '../completions/completions.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [HabitsModule, CompletionsModule, CommonModule],
  providers: [StatisticsService],
  controllers: [StatisticsController],
  exports: [StatisticsService],
})
export class StatisticsModule {}
