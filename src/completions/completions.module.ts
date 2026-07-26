import { Module } from '@nestjs/common';
import { CompletionsService } from './completions.service';
import { CompletionsController } from './completions.controller';
import { HabitsModule } from '../habits/habits.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [HabitsModule, CommonModule],
  providers: [CompletionsService],
  controllers: [CompletionsController],
  exports: [CompletionsService],
})
export class CompletionsModule {}
