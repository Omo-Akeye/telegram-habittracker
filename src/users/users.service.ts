import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTelegramId(telegramId: string) {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findOrCreate(telegramId: string, username?: string, firstName?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { telegramId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.user.create({
      data: {
        telegramId,
        username,
        firstName,
      },
    });
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
