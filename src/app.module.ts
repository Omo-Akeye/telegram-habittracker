import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HabitsModule } from './habits/habits.module';
import { CompletionsModule } from './completions/completions.module';
import { StatisticsModule } from './statistics/statistics.module';
import { RemindersModule } from './reminders/reminders.module';
import { TelegramModule } from './telegram/telegram.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    HabitsModule,
    CompletionsModule,
    StatisticsModule,
    RemindersModule,
    TelegramModule,
    SchedulerModule,
    CommonModule,
  ],
})
export class AppModule {}
