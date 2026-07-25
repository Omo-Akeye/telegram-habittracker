import { Module } from '@nestjs/common';
import { CompletionsService } from './completions.service';
import { CompletionsController } from './completions.controller';
import { HabitsModule } from '../habits/habits.module';

@Module({
  imports: [HabitsModule],
  providers: [CompletionsService],
  controllers: [CompletionsController],
  exports: [CompletionsService],
})
export class CompletionsModule {}
