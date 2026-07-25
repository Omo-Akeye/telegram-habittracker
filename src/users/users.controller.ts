import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { TelegramGuard } from '../common/guards/telegram.guard';

@ApiTags('users')
@Controller('users')
@UseGuards(TelegramGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@Headers('x-telegram-id') telegramId: string) {
    return this.usersService.findByTelegramId(telegramId);
  }
}
