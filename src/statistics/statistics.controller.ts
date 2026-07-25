import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { TelegramGuard } from '../common/guards/telegram.guard';
import { TelegramUser } from '../common/decorators/telegram-user.decorator';
import { User } from '@prisma/client';

@ApiTags('statistics')
@Controller('statistics')
@UseGuards(TelegramGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user statistics' })
  async getStats(@TelegramUser() user: User) {
    return this.statisticsService.getStats(user.id);
  }
}
