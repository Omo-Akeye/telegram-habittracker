import { Controller, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RemindersService } from './reminders.service';
import { TelegramGuard } from '../common/guards/telegram.guard';
import { TelegramUser } from '../common/decorators/telegram-user.decorator';
import { User } from '@prisma/client';

@ApiTags('reminders')
@Controller('habits/:id/reminders')
@UseGuards(TelegramGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a reminder for a habit' })
  async create(
    @TelegramUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body('time') time: string,
  ) {
    return this.remindersService.create(id, user.id, time);
  }
}
