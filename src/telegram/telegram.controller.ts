import { Controller, Post, Body, Headers, HttpCode, UnauthorizedException, Logger } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Body() update: Record<string, unknown>,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    const expectedSecret = this.configService.get<string>('WEBHOOK_SECRET');

    if (!expectedSecret) {
      this.logger.warn(
        'WEBHOOK_SECRET is not configured — webhook endpoint is unprotected. ' +
        'Set WEBHOOK_SECRET in your environment for production use.',
      );
    } else if (secretToken !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    await this.telegramService.handleUpdate(update);
    return { ok: true };
  }
}

