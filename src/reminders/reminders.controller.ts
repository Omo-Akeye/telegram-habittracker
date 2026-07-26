import { Controller, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RemindersService } from './reminders.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TelegramUser } from '../common/decorators/telegram-user.decorator';
import { User } from '@prisma/client';

@ApiTags('reminders')
@ApiBearerAuth()
@Controller('habits/:id/reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a reminder for a habit' })
  async create(
    @TelegramUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateReminderDto,
  ) {
    return this.remindersService.create(id, user.id, dto.time);
  }
}
