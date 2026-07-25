import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';

@Injectable()
export class HabitsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateHabitDto) {
    return this.prisma.habit.create({
      data: {
        userId,
        title: dto.title,
        emoji: dto.emoji ?? '✅',
        frequency: dto.frequency,
        target: dto.target ?? 1,
      },
      include: {
        completions: true,
        reminders: true,
      },
    });
  }

  async findAll(userId: number) {
    return this.prisma.habit.findMany({
      where: { userId, archived: false },
      include: {
        completions: true,
        reminders: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, userId: number) {
    const habit = await this.prisma.habit.findFirst({
      where: { id, userId },
      include: {
        completions: true,
        reminders: true,
      },
    });

    if (!habit) {
      throw new NotFoundException('Habit not found');
    }

    return habit;
  }

  async update(id: number, userId: number, dto: UpdateHabitDto) {
    await this.findOne(id, userId);

    return this.prisma.habit.update({
      where: { id },
      data: dto,
      include: {
        completions: true,
        reminders: true,
      },
    });
  }

  async remove(id: number, userId: number) {
    await this.findOne(id, userId);

    return this.prisma.habit.delete({
      where: { id },
    });
  }

  async findAllForUserRaw(userId: number) {
    return this.prisma.habit.findMany({
      where: { userId },
      include: {
        completions: true,
        reminders: true,
      },
    });
  }
}
