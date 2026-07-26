import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TelegramGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const apiKey = request.headers['x-api-key'];
    const expectedApiKey = this.configService.get<string>('API_KEY');

    if (!apiKey || apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

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
