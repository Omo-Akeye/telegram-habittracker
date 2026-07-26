import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Telegraf } from 'telegraf';
import { UsersService } from '../users/users.service';
import { HabitsService } from '../habits/habits.service';
import { CompletionsService } from '../completions/completions.service';
import { StatisticsService } from '../statistics/statistics.service';
import { RemindersService } from '../reminders/reminders.service';
import { AuthService } from '../auth/auth.service';
import { Frequency } from '@prisma/client';
import dayjs from 'dayjs';
import { escapeMarkdown } from '../common/utils/escape-markdown';

interface NewHabitState {
  step: 'title' | 'frequency' | 'reminder';
  title?: string;
  emoji?: string;
  frequency?: Frequency;
  target?: number;
  createdAt: number;
}

interface EditState {
  habitId: number;
  createdAt: number;
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
    @Inject(forwardRef(() => RemindersService))
    private readonly remindersService: RemindersService,
    private readonly authService: AuthService,
  ) {
    const token = this.configService.get<string>('BOT_TOKEN');
    if (!token) {
      throw new Error('BOT_TOKEN is not defined');
    }
    this.bot = new Telegraf(token);
  }

  async onModuleInit() {
    this.registerErrorHandler();
    this.registerCommands();
    this.registerActions();
    this.registerTextHandler();

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction) {
      await this.bot.launch();
      this.logger.log('Bot started in polling mode');
    }
  }

  private registerErrorHandler() {
    this.bot.catch((err: any, ctx: any) => {
      this.logger.error(`Unhandled error while processing update ${ctx?.update?.update_id}`, err);
    });
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  cleanStaleStates() {
    const cutoff = Date.now() - 30 * 60 * 1000;
    let cleaned = 0;

    for (const [userId, state] of this.newHabitStates) {
      if (state.createdAt < cutoff) {
        this.newHabitStates.delete(userId);
        cleaned++;
      }
    }

    for (const [userId, state] of this.editStates) {
      if (state.createdAt < cutoff) {
        this.editStates.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned ${cleaned} stale conversation states`);
    }
  }

  async handleUpdate(update: any) {
    try {
      await this.bot.handleUpdate(update);
    } catch (error) {
      this.logger.error('Error handling update', error);
    }
  }

  async sendReminder(telegramId: string, habit: any, reminderId: number) {
    const safeTitle = escapeMarkdown(habit.title || '');
    await this.bot.telegram.sendMessage(telegramId, `${habit.emoji || '✅'} *${safeTitle}*\n\nHave you completed today's habit?`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Completed', callback_data: `complete_reminder_${reminderId}` },
            { text: '⏰ Snooze', callback_data: `snooze_reminder_${reminderId}` },
            { text: '❌ Skip', callback_data: `skip_reminder_${reminderId}` },
          ],
        ],
      },
    });
  }

  private registerCommands() {
    this.bot.start(async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        const username = ctx.from.username;
        const firstName = ctx.from.first_name;

        const user = await this.usersService.findOrCreate(telegramId, username, firstName);

        const safeName = escapeMarkdown(user.firstName || 'to HabitBot');
        await ctx.reply(
          `Welcome ${safeName}! 🎯\n\n` +
          'Track your habits right from Telegram.\n\n' +
          'Commands:\n' +
          '/new - Create a new habit\n' +
          '/habits - View your habits\n' +
          '/stats - View your statistics\n' +
          '/help - Show available commands',
        );
      } catch (error) {
        this.logger.error('Error handling /start command', error);
        await ctx.reply('Error starting bot. Please try again later.');
      }
    });

    this.bot.help(async (ctx) => {
      await ctx.reply(
        'Available commands:\n\n' +
        '/start - Start the bot\n' +
        '/new - Create a new habit\n' +
        '/habits - View all your habits\n' +
        '/stats - View your statistics\n' +
        '/token - Get your API access token\n' +
        '/help - Show this message',
      );
    });

    this.bot.command('token', async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        // Ensure user exists first
        await this.usersService.findOrCreate(telegramId, ctx.from.username, ctx.from.first_name);
        const token = await this.authService.generateToken(telegramId);
        await ctx.reply(
          '🔑 *Your API Access Token*\n\n' +
          'Use this as a Bearer token in API requests:\n' +
          '`Authorization: Bearer ' + token + '`\n\n' +
          '⚠️ Keep this token private. It expires in 30 days.\n' +
          'Run /token again to generate a new one.',
          { parse_mode: 'Markdown' },
        );
      } catch (error) {
        await ctx.reply('Error generating token. Please try again.');
      }
    });

    this.bot.command('new', async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        await this.usersService.findOrCreate(telegramId, ctx.from.username, ctx.from.first_name);

        this.editStates.delete(ctx.from.id);
        this.newHabitStates.set(ctx.from.id, { step: 'title', createdAt: Date.now() });
        await ctx.reply('What is the name of your habit?');
      } catch (error) {
        this.logger.error('Error handling /new command', error);
        await ctx.reply('Error creating habit. Please try again later.');
      }
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
          const safeTitle = escapeMarkdown(habit.title || '');

          await ctx.reply(
            `${status} ${habit.emoji || '📋'} *${safeTitle}*\n` +
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
        await ctx.answerCbQuery('Error completing habit');
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
        await ctx.answerCbQuery('Error undoing completion');
      }
    });

    this.bot.action(/edit_(\d+)/, async (ctx) => {
      const habitId = parseInt(ctx.match[1]);
      this.newHabitStates.delete(ctx.from.id);
      this.editStates.set(ctx.from.id, { habitId, createdAt: Date.now() });
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
        await ctx.answerCbQuery('Error deleting habit');
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

    this.bot.action(/complete_reminder_(\d+)/, async (ctx) => {
      try {
        const reminderId = parseInt(ctx.match[1]);
        const telegramId = ctx.from.id.toString();
        const user = await this.usersService.findByTelegramId(telegramId);
        const reminder = await this.remindersService.getReminder(reminderId);

        if (!reminder) {
          await ctx.answerCbQuery('Reminder not found');
          return;
        }

        // H7 FIX: Verify the reminder belongs to the user pressing the button
        if (reminder.habit.userId !== user.id) {
          await ctx.answerCbQuery('This reminder does not belong to you');
          return;
        }

        await this.completionsService.create(reminder.habitId, user.id, {});

        const log = await this.remindersService.findTodayLog(reminderId);
        if (log) {
          await this.remindersService.markCompleted(log.id);
        }

        const stats = await this.statisticsService.getStats(user.id);

        await ctx.answerCbQuery();
        await ctx.editMessageText(
          `🔥 *Nice!*\n\nCurrent streak: *${stats.currentStreak} days*`,
          { parse_mode: 'Markdown' },
        );
      } catch (error: any) {
        await ctx.answerCbQuery('Error completing habit');
      }
    });

    this.bot.action(/snooze_reminder_(\d+)/, async (ctx) => {
      const reminderId = parseInt(ctx.match[1]);
      await ctx.answerCbQuery();
      await ctx.editMessageText('Snooze for how long?', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '15 min', callback_data: `snooze_15_${reminderId}` },
              { text: '30 min', callback_data: `snooze_30_${reminderId}` },
              { text: '1 hour', callback_data: `snooze_60_${reminderId}` },
            ],
          ],
        },
      });
    });

    this.bot.action(/snooze_(\d+)_(\d+)/, async (ctx) => {
      try {
        const minutes = parseInt(ctx.match[1]);
        const reminderId = parseInt(ctx.match[2]);

        const log = await this.remindersService.findTodayLog(reminderId);
        if (!log) {
          await ctx.answerCbQuery('Reminder log not found');
          return;
        }

        const snoozedUntil = dayjs().add(minutes, 'minute').toDate();
        await this.remindersService.markSnoozed(log.id, snoozedUntil);
        await ctx.answerCbQuery(`Snoozed for ${minutes} minutes`);
        await ctx.editMessageText(`⏰ I'll remind you again in ${minutes} minutes.`);
      } catch (error: any) {
        await ctx.answerCbQuery('Error snoozing');
      }
    });

    this.bot.action(/skip_reminder_(\d+)/, async (ctx) => {
      try {
        const reminderId = parseInt(ctx.match[1]);

        const log = await this.remindersService.findTodayLog(reminderId);
        if (log) {
          await this.remindersService.markSkipped(log.id);
        }

        await ctx.answerCbQuery();
        await ctx.editMessageText('No worries 🌱\n\nTomorrow is another chance.');
      } catch (error: any) {
        await ctx.answerCbQuery('Error skipping');
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

              const safeTitle = escapeMarkdown(newHabitState.title || '');
              await ctx.reply(
                `Habit created! 🎉\n\n` +
                `${newHabitState.emoji || '✅'} *${safeTitle}*\n` +
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

      const safeTitle = escapeMarkdown(habit.title || '');
      await ctx.reply(
        `Habit updated! ✏️\n\n` +
        `${habit.emoji || '✅'} *${safeTitle}*\n` +
        `Frequency: ${habit.frequency} | Target: ${habit.target}`,
        { parse_mode: 'Markdown' },
      );

      this.editStates.delete(ctx.from.id);
    } catch (error: any) {
      await ctx.reply('Error updating habit. Please try again.');
      this.editStates.delete(ctx.from.id);
    }
  }

  private async saveHabit(ctx: any, state: NewHabitState) {
    const telegramId = ctx.from.id.toString();
    const user = await this.usersService.findByTelegramId(telegramId);
    const habit = await this.createHabit(user.id, state);

    const safeTitle = escapeMarkdown(state.title || '');
    await ctx.reply(
      `Habit created! 🎉\n\n` +
      `${state.emoji || '✅'} *${safeTitle}*\n` +
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
