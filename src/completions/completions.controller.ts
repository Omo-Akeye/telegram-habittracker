import { Controller, Post, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CompletionsService } from './completions.service';
import { CreateCompletionDto } from './dto/create-completion.dto';
import { TelegramGuard } from '../common/guards/telegram.guard';
import { TelegramUser } from '../common/decorators/telegram-user.decorator';
import { User } from '@prisma/client';

@ApiTags('completions')
@Controller('habits/:id/completions')
@UseGuards(TelegramGuard)
export class CompletionsController {
  constructor(private readonly completionsService: CompletionsService) {}

  @Post()
  @ApiOperation({ summary: 'Complete a habit for today' })
  async create(
    @TelegramUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCompletionDto,
  ) {
    return this.completionsService.create(id, user.id, dto);
  }

  @Delete('today')
  @ApiOperation({ summary: 'Remove today completion' })
  async removeToday(@TelegramUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.completionsService.removeToday(id, user.id);
  }
}
