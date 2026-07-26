import { Controller, Post, Body, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Body() update: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    const expectedSecret = this.configService.get<string>('WEBHOOK_SECRET');

    if (expectedSecret && secretToken !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    await this.telegramService.handleUpdate(update);
    return { ok: true };
  }
}
