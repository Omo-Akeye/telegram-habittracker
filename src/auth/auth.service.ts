import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(telegramId: string) {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async generateToken(telegramId: string): Promise<string> {
    const user = await this.validateUser(telegramId);
    const payload = { sub: user.id, telegramId: user.telegramId };
    return this.jwtService.sign(payload);
  }
}
