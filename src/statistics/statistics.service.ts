import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HabitsService } from '../habits/habits.service';
import { CompletionsService } from '../completions/completions.service';
import dayjs from 'dayjs';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly habitsService: HabitsService,
    private readonly completionsService: CompletionsService,
  ) {}

  async getStats(userId: number) {
    const habits = await this.habitsService.findAllForUserRaw(userId);
    const totalHabits = habits.filter((h) => !h.archived).length;
    const todayCount = await this.completionsService.countToday(userId);
    const streak = await this.calculateStreak(userId);
    const longestStreak = await this.calculateLongestStreak(userId);
    const completionRate = await this.calculateCompletionRate(userId);

    return {
      currentStreak: streak,
      longestStreak,
      completionRate,
      todayCompleted: todayCount,
      totalHabits,
    };
  }

  private async calculateStreak(userId: number): Promise<number> {
    const completionDates = await this.getCompletionDates(userId);
    if (completionDates.length === 0) return 0;

    let streak = 0;
    const today = dayjs().format('YYYY-MM-DD');
    const datesSet = new Set(completionDates);

    for (let i = 0; ; i++) {
      const date = dayjs(today).subtract(i, 'day').format('YYYY-MM-DD');
      if (datesSet.has(date)) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  private async calculateLongestStreak(userId: number): Promise<number> {
    const completionDates = await this.getCompletionDates(userId);
    if (completionDates.length === 0) return 0;

    const dates = [...new Set(completionDates)].sort();
    let longest = 1;
    let current = 1;

    for (let i = 1; i < dates.length; i++) {
      const prev = dayjs(dates[i - 1]);
      const curr = dayjs(dates[i]);
      if (curr.diff(prev, 'day') === 1) {
        current++;
        longest = Math.max(longest, current);
      } else {
        current = 1;
      }
    }

    return longest;
  }

  private async calculateCompletionRate(userId: number): Promise<number> {
    const habits = await this.habitsService.findAllForUserRaw(userId);
    const activeHabits = habits.filter((h) => !h.archived);

    if (activeHabits.length === 0) return 0;

    const today = dayjs().format('YYYY-MM-DD');
    const todayCompletions = await this.prisma.completion.findMany({
      where: {
        habit: { userId },
        date: today,
      },
    });

    const completedHabitIds = new Set(todayCompletions.map((c) => c.habitId));
    const total = activeHabits.length;
    const completed = activeHabits.filter((h) => completedHabitIds.has(h.id)).length;

    return Math.round((completed / total) * 100);
  }

  private async getCompletionDates(userId: number): Promise<string[]> {
    const completions = await this.prisma.completion.findMany({
      where: {
        habit: { userId },
      },
      select: { date: true },
    });

    return [...new Set(completions.map((c) => c.date))].sort();
  }
}
