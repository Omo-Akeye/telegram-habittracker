import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(@Body() update: any) {
    await this.telegramService.handleUpdate(update);
    return { ok: true };
  }
}
