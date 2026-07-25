import { Module } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { HabitsModule } from '../habits/habits.module';
import { CompletionsModule } from '../completions/completions.module';

@Module({
  imports: [HabitsModule, CompletionsModule],
  providers: [StatisticsService],
  controllers: [StatisticsController],
})
export class StatisticsModule {}
