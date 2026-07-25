import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateUser(telegramId: string) {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
