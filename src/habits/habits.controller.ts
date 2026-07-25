import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HabitsService } from './habits.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';
import { TelegramGuard } from '../common/guards/telegram.guard';
import { TelegramUser } from '../common/decorators/telegram-user.decorator';
import { User } from '@prisma/client';

@ApiTags('habits')
@Controller('habits')
@UseGuards(TelegramGuard)
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new habit' })
  async create(@TelegramUser() user: User, @Body() dto: CreateHabitDto) {
    return this.habitsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all habits' })
  async findAll(@TelegramUser() user: User) {
    return this.habitsService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a habit by id' })
  async findOne(@TelegramUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.habitsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a habit' })
  async update(
    @TelegramUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHabitDto,
  ) {
    return this.habitsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a habit' })
  async remove(@TelegramUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.habitsService.remove(id, user.id);
  }
}
