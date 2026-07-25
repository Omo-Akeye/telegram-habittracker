import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HabitsService } from '../habits/habits.service';

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly habitsService: HabitsService,
  ) {}

  async create(habitId: number, userId: number, time: string) {
    await this.habitsService.findOne(habitId, userId);

    return this.prisma.reminder.create({
      data: {
        habitId,
        time,
      },
      include: {
        habit: true,
      },
    });
  }

  async findByHabit(habitId: number) {
    return this.prisma.reminder.findMany({
      where: { habitId },
    });
  }

  async findDueReminders(currentTime: string) {
    return this.prisma.reminder.findMany({
      where: {
        enabled: true,
        time: currentTime,
      },
      include: {
        habit: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  async toggle(id: number, userId: number) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id },
      include: { habit: true },
    });

    if (!reminder || reminder.habit.userId !== userId) {
      throw new NotFoundException('Reminder not found');
    }

    return this.prisma.reminder.update({
      where: { id },
      data: { enabled: !reminder.enabled },
    });
  }

  async remove(id: number, userId: number) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id },
      include: { habit: true },
    });

    if (!reminder || reminder.habit.userId !== userId) {
      throw new NotFoundException('Reminder not found');
    }

    return this.prisma.reminder.delete({
      where: { id },
    });
  }
}
