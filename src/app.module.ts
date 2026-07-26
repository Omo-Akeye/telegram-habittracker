import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Rate limiting: 20 req per 10s (burst), 100 req per 60s (sustained)
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 10000, limit: 20 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
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
    HealthModule,
  ],
  providers: [
    // Apply rate limiting globally to all endpoints
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
