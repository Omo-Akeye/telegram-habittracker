import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HabitsService } from '../habits/habits.service';
import { CreateCompletionDto } from './dto/create-completion.dto';
import dayjs from 'dayjs';

@Injectable()
export class CompletionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly habitsService: HabitsService,
  ) {}

  async create(habitId: number, userId: number, dto: CreateCompletionDto) {
    const habit = await this.habitsService.findOne(habitId, userId);
    const today = dayjs().format('YYYY-MM-DD');

    const existing = await this.prisma.completion.findUnique({
      where: {
        habitId_date: {
          habitId,
          date: today,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Habit already completed today');
    }

    return this.prisma.completion.create({
      data: {
        habitId,
        date: today,
        value: dto.value ?? 1.0,
      },
      include: {
        habit: true,
      },
    });
  }

  async removeToday(habitId: number, userId: number) {
    await this.habitsService.findOne(habitId, userId);
    const today = dayjs().format('YYYY-MM-DD');

    const completion = await this.prisma.completion.findUnique({
      where: {
        habitId_date: {
          habitId,
          date: today,
        },
      },
    });

    if (!completion) {
      throw new NotFoundException('No completion found for today');
    }

    return this.prisma.completion.delete({
      where: { id: completion.id },
    });
  }

  async findByHabit(habitId: number) {
    return this.prisma.completion.findMany({
      where: { habitId },
      orderBy: { completedAt: 'desc' },
    });
  }

  async findByUser(userId: number) {
    const habits = await this.habitsService.findAllForUserRaw(userId);
    const habitIds = habits.map((h) => h.id);

    return this.prisma.completion.findMany({
      where: { habitId: { in: habitIds } },
      include: { habit: true },
      orderBy: { completedAt: 'desc' },
    });
  }

  async countToday(userId: number) {
    const today = dayjs().format('YYYY-MM-DD');
    const habits = await this.habitsService.findAllForUserRaw(userId);
    const habitIds = habits.map((h) => h.id);

    return this.prisma.completion.count({
      where: {
        habitId: { in: habitIds },
        date: today,
      },
    });
  }
}
