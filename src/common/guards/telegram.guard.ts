import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TelegramGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const telegramId = request.headers['x-telegram-id'];

    if (!telegramId) {
      throw new UnauthorizedException('Missing x-telegram-id header');
    }

    const user = await this.prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    request.user = user;
    return true;
  }
}
