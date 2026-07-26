import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HabitsService } from '../habits/habits.service';
import { CompletionsService } from '../completions/completions.service';
import { Frequency } from '@prisma/client';
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
    const activeHabits = habits.filter((h) => !h.archived);
    const totalHabits = activeHabits.length;
    const todayCount = await this.completionsService.countToday(userId);
    const streak = await this.calculateStreak(userId, activeHabits);
    const longestStreak = await this.calculateLongestStreak(userId, activeHabits);
    const completionRate = await this.calculateCompletionRate(userId, activeHabits);

    return {
      currentStreak: streak,
      longestStreak,
      completionRate,
      todayCompleted: todayCount,
      totalHabits,
    };
  }

  /**
   * Checks if a given date is a "due day" for the user based on their habits.
   * A day is due if at least one active habit is scheduled for it.
   */
  private isDueDay(date: dayjs.Dayjs, habits: Array<{ frequency: Frequency; days: string | null }>): boolean {
    const dayName = date.format('ddd').toUpperCase();

    for (const habit of habits) {
      if (habit.frequency === Frequency.DAILY) {
        return true;
      }

      if (habit.frequency === Frequency.CUSTOM && habit.days) {
        const activeDays = habit.days.split(',').map((d) => d.trim().toUpperCase());
        if (activeDays.includes(dayName)) {
          return true;
        }
      }

      if (habit.frequency === Frequency.WEEKLY) {
        // Weekly habits count every day as potentially due
        return true;
      }
    }

    return false;
  }

  private async calculateStreak(
    userId: number,
    activeHabits: Array<{ frequency: Frequency; days: string | null }>,
  ): Promise<number> {
    if (activeHabits.length === 0) return 0;

    const completionDates = await this.getCompletionDates(userId);
    if (completionDates.length === 0) return 0;

    let streak = 0;
    const today = dayjs();
    const datesSet = new Set(completionDates);

    for (let i = 0; ; i++) {
      const date = today.subtract(i, 'day');
      const dateStr = date.format('YYYY-MM-DD');

      if (!this.isDueDay(date, activeHabits)) {
        // Not a due day — skip without breaking streak
        continue;
      }

      if (datesSet.has(dateStr)) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  private async calculateLongestStreak(
    userId: number,
    activeHabits: Array<{ frequency: Frequency; days: string | null }>,
  ): Promise<number> {
    if (activeHabits.length === 0) return 0;

    const completionDates = await this.getCompletionDates(userId);
    if (completionDates.length === 0) return 0;

    const dates = [...new Set(completionDates)].sort();
    const datesSet = new Set(dates);

    // Walk from the earliest completion date to today, tracking streaks
    const start = dayjs(dates[0]);
    const end = dayjs();
    let longest = 0;
    let current = 0;

    for (let d = start; d.isBefore(end) || d.isSame(end, 'day'); d = d.add(1, 'day')) {
      const dateStr = d.format('YYYY-MM-DD');

      if (!this.isDueDay(d, activeHabits)) {
        // Non-due day: don't break or increment
        continue;
      }

      if (datesSet.has(dateStr)) {
        current++;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }

    return longest;
  }

  private async calculateCompletionRate(
    userId: number,
    activeHabits: Array<{ id: number; archived: boolean }>,
  ): Promise<number> {
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
