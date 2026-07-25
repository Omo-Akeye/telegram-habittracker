import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { UsersService } from '../users/users.service';
import { HabitsService } from '../habits/habits.service';
import { CompletionsService } from '../completions/completions.service';
import { StatisticsService } from '../statistics/statistics.service';
import { RemindersService } from '../reminders/reminders.service';
import { Frequency } from '@prisma/client';
import dayjs from 'dayjs';

interface NewHabitState {
  step: 'title' | 'frequency' | 'reminder';
  title?: string;
  emoji?: string;
  frequency?: Frequency;
  target?: number;
}

interface EditState {
  habitId: number;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;
  private readonly newHabitStates = new Map<number, NewHabitState>();
  private readonly editStates = new Map<number, EditState>();

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly habitsService: HabitsService,
    private readonly completionsService: CompletionsService,
    private readonly statisticsService: StatisticsService,
    private readonly remindersService: RemindersService,
  ) {
    const token = this.configService.get<string>('BOT_TOKEN');
    if (!token) {
      throw new Error('BOT_TOKEN is not defined');
    }
    this.bot = new Telegraf(token);
  }

  async onModuleInit() {
    this.registerCommands();
    this.registerActions();
    this.registerTextHandler();

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction) {
      await this.bot.launch();
      this.logger.log('Bot started in polling mode');
    }
  }

  async handleUpdate(update: any) {
    try {
      await this.bot.handleUpdate(update);
    } catch (error) {
      this.logger.error('Error handling update', error);
    }
  }

  private registerCommands() {
    this.bot.start(async (ctx) => {
      const telegramId = ctx.from.id.toString();
      const username = ctx.from.username;
      const firstName = ctx.from.first_name;

      const user = await this.usersService.findOrCreate(telegramId, username, firstName);

      await ctx.reply(
        `Welcome ${user.firstName || 'to HabitBot'}! 🎯\n\n` +
        'Track your habits right from Telegram.\n\n' +
        'Commands:\n' +
        '/new - Create a new habit\n' +
        '/habits - View your habits\n' +
        '/stats - View your statistics\n' +
        '/help - Show available commands',
      );
    });

    this.bot.help(async (ctx) => {
      await ctx.reply(
        'Available commands:\n\n' +
        '/start - Start the bot\n' +
        '/new - Create a new habit\n' +
        '/habits - View all your habits\n' +
        '/stats - View your statistics\n' +
        '/help - Show this message',
      );
    });

    this.bot.command('new', async (ctx) => {
      const telegramId = ctx.from.id.toString();
      await this.usersService.findOrCreate(telegramId, ctx.from.username, ctx.from.first_name);

      this.newHabitStates.set(ctx.from.id, { step: 'title' });
      await ctx.reply('What is the name of your habit?');
    });

    this.bot.command('habits', async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        const user = await this.usersService.findByTelegramId(telegramId);
        const habits = await this.habitsService.findAll(user.id);

        if (habits.length === 0) {
          await ctx.reply('You have no habits yet. Create one with /new');
          return;
        }

        for (const habit of habits) {
          const today = dayjs().format('YYYY-MM-DD');
          const completedToday = habit.completions.some((c) => c.date === today);
          const status = completedToday ? '✅' : '⬜';

          await ctx.reply(
            `${status} ${habit.emoji || '📋'} *${habit.title}*\n` +
            `Frequency: ${habit.frequency} | Target: ${habit.target}`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: completedToday ? '🔄 Undo' : '✅ Complete', callback_data: `complete_${habit.id}` },
                    { text: '✏ Edit', callback_data: `edit_${habit.id}` },
                    { text: '🗑 Delete', callback_data: `delete_${habit.id}` },
                  ],
                ],
              },
            },
          );
        }
      } catch (error) {
        await ctx.reply('Error loading habits. Please try again.');
      }
    });

    this.bot.command('stats', async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        const user = await this.usersService.findByTelegramId(telegramId);
        const stats = await this.statisticsService.getStats(user.id);

        await ctx.reply(
          '📊 *Your Statistics*\n\n' +
          `🔥 Current Streak: *${stats.currentStreak} days*\n` +
          `🏆 Longest Streak: *${stats.longestStreak} days*\n` +
          `📈 Completion Rate: *${stats.completionRate}%*\n` +
          `✅ Completed Today: *${stats.todayCompleted}*\n` +
          `📋 Total Habits: *${stats.totalHabits}*`,
          { parse_mode: 'Markdown' },
        );
      } catch (error) {
        await ctx.reply('Error loading statistics. Please try again.');
      }
    });
  }

  private registerActions() {
    this.bot.action(/complete_(\d+)/, async (ctx) => {
      try {
        const habitId = parseInt(ctx.match[1]);
        const telegramId = ctx.from.id.toString();
        const user = await this.usersService.findByTelegramId(telegramId);

        await this.completionsService.create(habitId, user.id, {});
        await ctx.answerCbQuery('Habit completed! ✅');
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: '🔄 Undo', callback_data: `undo_${habitId}` },
              { text: '✏ Edit', callback_data: `edit_${habitId}` },
              { text: '🗑 Delete', callback_data: `delete_${habitId}` },
            ],
          ],
        });
      } catch (error: any) {
        await ctx.answerCbQuery(error.message || 'Error completing habit');
      }
    });

    this.bot.action(/undo_(\d+)/, async (ctx) => {
      try {
        const habitId = parseInt(ctx.match[1]);
        const telegramId = ctx.from.id.toString();
        const user = await this.usersService.findByTelegramId(telegramId);

        await this.completionsService.removeToday(habitId, user.id);
        await ctx.answerCbQuery('Completion undone');
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: '✅ Complete', callback_data: `complete_${habitId}` },
              { text: '✏ Edit', callback_data: `edit_${habitId}` },
              { text: '🗑 Delete', callback_data: `delete_${habitId}` },
            ],
          ],
        });
      } catch (error: any) {
        await ctx.answerCbQuery(error.message || 'Error undoing completion');
      }
    });

    this.bot.action(/edit_(\d+)/, async (ctx) => {
      const habitId = parseInt(ctx.match[1]);
      this.editStates.set(ctx.from.id, { habitId });
      await ctx.answerCbQuery();
      await ctx.reply('Enter a new title for this habit:');
    });

    this.bot.action(/delete_(\d+)/, async (ctx) => {
      try {
        const habitId = parseInt(ctx.match[1]);
        const telegramId = ctx.from.id.toString();
        const user = await this.usersService.findByTelegramId(telegramId);

        await this.habitsService.remove(habitId, user.id);
        await ctx.answerCbQuery('Habit deleted 🗑');
        await ctx.deleteMessage();
      } catch (error: any) {
        await ctx.answerCbQuery(error.message || 'Error deleting habit');
      }
    });

    this.bot.action(/freq_(.+)/, async (ctx) => {
      const frequency = ctx.match[1] as Frequency;
      const state = this.newHabitStates.get(ctx.from.id);

      if (state && state.step === 'frequency') {
        state.frequency = frequency;
        state.step = 'reminder';
        await ctx.answerCbQuery();
        await ctx.reply(
          'When should I remind you?\n' +
          'Enter time in HH:MM format (24h), or type "skip" for no reminder.',
        );
      }
    });
  }

  private registerTextHandler() {
    this.bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;

      const editState = this.editStates.get(ctx.from.id);
      if (editState) {
        await this.handleEditText(ctx, editState);
        return;
      }

      const newHabitState = this.newHabitStates.get(ctx.from.id);
      if (!newHabitState) return;

      try {
        switch (newHabitState.step) {
          case 'title': {
            newHabitState.title = ctx.message.text;
            newHabitState.step = 'frequency';
            await ctx.reply(
              'How often will you do this habit?',
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: 'Daily', callback_data: 'freq_DAILY' },
                      { text: 'Weekly', callback_data: 'freq_WEEKLY' },
                      { text: 'Custom', callback_data: 'freq_CUSTOM' },
                    ],
                  ],
                },
              },
            );
            break;
          }

          case 'reminder': {
            const time = ctx.message.text.trim();

            if (time.toLowerCase() === 'skip') {
              await this.saveHabit(ctx, newHabitState);
              this.newHabitStates.delete(ctx.from.id);
            } else if (/^\d{2}:\d{2}$/.test(time)) {
              const telegramId = ctx.from.id.toString();
              const user = await this.usersService.findByTelegramId(telegramId);
              const habit = await this.createHabit(user.id, newHabitState);

              await this.remindersService.create(habit.id, user.id, time);

              await ctx.reply(
                `Habit created! 🎉\n\n` +
                `${newHabitState.emoji || '✅'} *${newHabitState.title}*\n` +
                `Frequency: ${newHabitState.frequency}\n` +
                `Reminder: ${time}\n\n` +
                `View your habits with /habits`,
                { parse_mode: 'Markdown' },
              );

              this.newHabitStates.delete(ctx.from.id);
            } else {
              await ctx.reply('Please enter a valid time in HH:MM format (e.g., 09:00) or type "skip".');
              return;
            }
            break;
          }
        }
      } catch (error) {
        this.logger.error('Error in text handler', error);
        await ctx.reply('Something went wrong. Please try again with /new');
        this.newHabitStates.delete(ctx.from.id);
      }
    });
  }

  private async handleEditText(ctx: any, editState: EditState) {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.usersService.findByTelegramId(telegramId);
      const newTitle = ctx.message.text.trim();
      const habit = await this.habitsService.update(editState.habitId, user.id, { title: newTitle });

      await ctx.reply(
        `Habit updated! ✏️\n\n` +
        `${habit.emoji || '✅'} *${habit.title}*\n` +
        `Frequency: ${habit.frequency} | Target: ${habit.target}`,
        { parse_mode: 'Markdown' },
      );

      this.editStates.delete(ctx.from.id);
    } catch (error: any) {
      await ctx.reply(error.message || 'Error updating habit. Please try again.');
      this.editStates.delete(ctx.from.id);
    }
  }

  private async saveHabit(ctx: any, state: NewHabitState) {
    const telegramId = ctx.from.id.toString();
    const user = await this.usersService.findByTelegramId(telegramId);
    const habit = await this.createHabit(user.id, state);

    await ctx.reply(
      `Habit created! 🎉\n\n` +
      `${state.emoji || '✅'} *${state.title}*\n` +
      `Frequency: ${state.frequency}\n\n` +
      `View your habits with /habits`,
      { parse_mode: 'Markdown' },
    );
  }

  private async createHabit(userId: number, state: NewHabitState) {
    return this.habitsService.create(userId, {
      title: state.title!,
      emoji: state.emoji,
      frequency: state.frequency!,
      target: state.target,
    });
  }
}
