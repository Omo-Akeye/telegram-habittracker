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
  step: 'title' | 'emoji' | 'frequency' | 'custom_days' | 'target' | 'reminder';
  title?: string;
  emoji?: string;
  frequency?: Frequency;
  selectedDays?: string[];
  target?: number;
  createdAt: number;
}

interface EditState {
  habitId: number;
  createdAt: number;
}

interface NoteState {
  habitId: number;
  createdAt: number;
}

function buildProgressBar(percent: number, length: number = 10): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;
  private readonly newHabitStates = new Map<number, NewHabitState>();
  private readonly editStates = new Map<number, EditState>();
  private readonly noteStates = new Map<number, NoteState>();

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
    await this.setupBotCommands();

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction) {
      await this.bot.launch();
      this.logger.log('Bot started in polling mode');
    }
  }

  private async setupBotCommands() {
    try {
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Start the bot & show welcome message' },
        { command: 'new', description: 'Create a new habit' },
        { command: 'habits', description: 'View and manage your habits' },
        { command: 'stats', description: 'View your habit statistics' },
        { command: 'token', description: 'Get your API access token' },
        { command: 'help', description: 'Show available commands' },
      ]);
      this.logger.log('Registered bot commands menu with Telegram');
    } catch (error) {
      this.logger.error('Failed to register bot commands with Telegram', error);
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

    for (const [userId, state] of this.noteStates) {
      if (state.createdAt < cutoff) {
        this.noteStates.delete(userId);
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
        this.noteStates.delete(ctx.from.id);
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
          const todayCompletion = habit.completions.find((c) => c.date === today);
          const completedToday = !!todayCompletion;
          const status = completedToday ? '✅' : '⬜';
          const safeTitle = escapeMarkdown(habit.title || '');

          const target = habit.target || 1;
          const percent = completedToday ? 100 : 0;
          const bar = buildProgressBar(percent, 8);

          let details = `${status} ${habit.emoji || '📋'} *${safeTitle}*\n` +
            `Progress: \`[${bar}]\` ${percent}%\n` +
            `Frequency: ${habit.frequency} | Target: ${target}`;

          if (todayCompletion?.note) {
            const safeNote = escapeMarkdown(todayCompletion.note);
            details += `\n📝 Note: _"${safeNote}"_`;
          }

          await ctx.reply(details, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: completedToday ? '🔄 Undo' : '✅ Complete', callback_data: `complete_${habit.id}` },
                  { text: '📝 Note', callback_data: `add_note_${habit.id}` },
                  { text: '✏ Edit', callback_data: `edit_${habit.id}` },
                  { text: '🗑 Delete', callback_data: `delete_${habit.id}` },
                ],
              ],
            },
          });
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

        const rateBar = buildProgressBar(stats.completionRate, 10);

        await ctx.reply(
          '📊 *Your Habit Statistics*\n\n' +
          `📈 Completion Rate: \`[${rateBar}]\` *${stats.completionRate}%*\n\n` +
          `🔥 Current Streak: *${stats.currentStreak} days*\n` +
          `🏆 Longest Streak: *${stats.longestStreak} days*\n` +
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
    this.bot.action(/emoji_(.+)/, async (ctx) => {
      const emoji = ctx.match[1];
      const state = this.newHabitStates.get(ctx.from.id);
      if (state && state.step === 'emoji') {
        state.emoji = emoji;
        state.step = 'frequency';
        await ctx.answerCbQuery();
        await ctx.reply(
          'How often will you do this habit?',
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Daily', callback_data: 'freq_DAILY' },
                  { text: 'Weekly', callback_data: 'freq_WEEKLY' },
                  { text: 'Custom Days', callback_data: 'freq_CUSTOM' },
                ],
              ],
            },
          },
        );
      }
    });

    this.bot.action(/freq_(.+)/, async (ctx) => {
      const frequency = ctx.match[1] as Frequency;
      const state = this.newHabitStates.get(ctx.from.id);

      if (state && state.step === 'frequency') {
        state.frequency = frequency;
        await ctx.answerCbQuery();

        if (frequency === Frequency.CUSTOM) {
          state.selectedDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
          state.step = 'custom_days';
          await this.sendCustomDaysKeyboard(ctx, state.selectedDays);
        } else {
          state.step = 'target';
          await this.sendTargetKeyboard(ctx);
        }
      }
    });

    this.bot.action(/toggle_day_(.+)/, async (ctx) => {
      const day = ctx.match[1];
      const state = this.newHabitStates.get(ctx.from.id);
      if (state && state.step === 'custom_days' && state.selectedDays) {
        if (state.selectedDays.includes(day)) {
          state.selectedDays = state.selectedDays.filter((d) => d !== day);
        } else {
          state.selectedDays.push(day);
        }
        await ctx.answerCbQuery();
        await this.editCustomDaysKeyboard(ctx, state.selectedDays);
      }
    });

    this.bot.action('confirm_days', async (ctx) => {
      const state = this.newHabitStates.get(ctx.from.id);
      if (state && state.step === 'custom_days') {
        if (!state.selectedDays || state.selectedDays.length === 0) {
          await ctx.answerCbQuery('Please select at least 1 day!');
          return;
        }
        state.step = 'target';
        await ctx.answerCbQuery();
        await this.sendTargetKeyboard(ctx);
      }
    });

    this.bot.action(/target_(\d+)/, async (ctx) => {
      const target = parseInt(ctx.match[1]);
      const state = this.newHabitStates.get(ctx.from.id);
      if (state && state.step === 'target') {
        state.target = target;
        state.step = 'reminder';
        await ctx.answerCbQuery();
        await this.sendReminderTimePresets(ctx);
      }
    });

    this.bot.action(/time_preset_(.+)/, async (ctx) => {
      const time = ctx.match[1];
      const state = this.newHabitStates.get(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await this.completeHabitCreationWithTime(ctx, state, time);
      }
    });

    this.bot.action(/time_tab_(.+)/, async (ctx) => {
      const tab = ctx.match[1];
      const state = this.newHabitStates.get(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await this.sendTimeTabSlots(ctx, tab);
      }
    });

    this.bot.action('time_presets_home', async (ctx) => {
      const state = this.newHabitStates.get(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await this.sendReminderTimePresets(ctx, true);
      }
    });

    this.bot.action('time_custom', async (ctx) => {
      const state = this.newHabitStates.get(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await ctx.reply('Please reply with your reminder time in HH:MM format (24h), e.g. 07:30 or 21:00.');
      }
    });

    this.bot.action('time_skip', async (ctx) => {
      const state = this.newHabitStates.get(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await this.saveHabit(ctx, state);
        this.newHabitStates.delete(ctx.from.id);
      }
    });

    this.bot.action(/complete_(\d+)/, async (ctx) => {
      try {
        const habitId = parseInt(ctx.match[1]);
        const telegramId = ctx.from.id.toString();
        const user = await this.usersService.findByTelegramId(telegramId);

        await this.completionsService.create(habitId, user.id, {});
        await ctx.answerCbQuery('Habit completed! 🎉');
        await ctx.editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: '🔄 Undo', callback_data: `undo_${habitId}` },
              { text: '📝 Note', callback_data: `add_note_${habitId}` },
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
              { text: '📝 Note', callback_data: `add_note_${habitId}` },
              { text: '✏ Edit', callback_data: `edit_${habitId}` },
              { text: '🗑 Delete', callback_data: `delete_${habitId}` },
            ],
          ],
        });
      } catch (error: any) {
        await ctx.answerCbQuery('Error undoing completion');
      }
    });

    this.bot.action(/add_note_(\d+)/, async (ctx) => {
      const habitId = parseInt(ctx.match[1]);
      this.noteStates.set(ctx.from.id, { habitId, createdAt: Date.now() });
      await ctx.answerCbQuery();
      await ctx.reply('📝 Reply with a note or reflection for today\'s habit entry:');
    });

    this.bot.action(/edit_(\d+)/, async (ctx) => {
      const habitId = parseInt(ctx.match[1]);
      this.newHabitStates.delete(ctx.from.id);
      this.noteStates.delete(ctx.from.id);
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

  private async sendCustomDaysKeyboard(ctx: any, selectedDays: string[]) {
    const dayButtons = ALL_DAYS.map((day) => {
      const selected = selectedDays.includes(day);
      return {
        text: `${selected ? '✅' : '⬜'} ${day}`,
        callback_data: `toggle_day_${day}`,
      };
    });

    const row1 = dayButtons.slice(0, 4);
    const row2 = dayButtons.slice(4, 7);

    await ctx.reply(
      'Select active days for your habit:',
      {
        reply_markup: {
          inline_keyboard: [
            row1,
            row2,
            [{ text: '🏁 Confirm Selection', callback_data: 'confirm_days' }],
          ],
        },
      },
    );
  }

  private async editCustomDaysKeyboard(ctx: any, selectedDays: string[]) {
    const dayButtons = ALL_DAYS.map((day) => {
      const selected = selectedDays.includes(day);
      return {
        text: `${selected ? '✅' : '⬜'} ${day}`,
        callback_data: `toggle_day_${day}`,
      };
    });

    const row1 = dayButtons.slice(0, 4);
    const row2 = dayButtons.slice(4, 7);

    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        row1,
        row2,
        [{ text: '🏁 Confirm Selection', callback_data: 'confirm_days' }],
      ],
    });
  }

  private async sendTargetKeyboard(ctx: any) {
    await ctx.reply(
      'What is your target per day/week?',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '1 time', callback_data: 'target_1' },
              { text: '2 times', callback_data: 'target_2' },
              { text: '5 times', callback_data: 'target_5' },
            ],
            [
              { text: '10 times', callback_data: 'target_10' },
              { text: '30 mins', callback_data: 'target_30' },
            ],
          ],
        },
      },
    );
  }

  private async sendReminderTimePresets(ctx: any, isEdit = false) {
    const text = '⏰ *When should I remind you?*\nChoose a preset time, select a tab, or enter a custom time:';
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🌅 Morning (08:00)', callback_data: 'time_preset_08:00' },
          { text: '☀️ Noon (12:00)', callback_data: 'time_preset_12:00' },
        ],
        [
          { text: '🌆 Evening (18:00)', callback_data: 'time_preset_18:00' },
          { text: '🌙 Night (21:00)', callback_data: 'time_preset_21:00' },
        ],
        [
          { text: '🌅 Morning Slots', callback_data: 'time_tab_morning' },
          { text: '☀️ Afternoon Slots', callback_data: 'time_tab_afternoon' },
          { text: '🌙 Night Slots', callback_data: 'time_tab_night' },
        ],
        [
          { text: '⌨️ Custom Time', callback_data: 'time_custom' },
          { text: '⏩ Skip Reminder', callback_data: 'time_skip' },
        ],
      ],
    };

    if (isEdit) {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
  }

  private async sendTimeTabSlots(ctx: any, tab: string) {
    let slots: string[] = [];
    let title = '';

    if (tab === 'morning') {
      title = '🌅 *Morning Time Slots*:';
      slots = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00'];
    } else if (tab === 'afternoon') {
      title = '☀️ *Afternoon Time Slots*:';
      slots = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    } else {
      title = '🌙 *Evening / Night Time Slots*:';
      slots = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];
    }

    const row1 = slots.slice(0, 3).map((t) => ({ text: t, callback_data: `time_preset_${t}` }));
    const row2 = slots.slice(3, 6).map((t) => ({ text: t, callback_data: `time_preset_${t}` }));

    await ctx.editMessageText(title, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          row1,
          row2,
          [{ text: '🔙 Back to Presets', callback_data: 'time_presets_home' }],
        ],
      },
    });
  }

  private async completeHabitCreationWithTime(ctx: any, state: NewHabitState, time: string) {
    const telegramId = ctx.from.id.toString();
    const user = await this.usersService.findByTelegramId(telegramId);
    const habit = await this.createHabit(user.id, state);

    await this.remindersService.create(habit.id, user.id, time);

    const safeTitle = escapeMarkdown(state.title || '');
    const daysInfo = state.selectedDays ? `\nDays: ${state.selectedDays.join(', ')}` : '';
    await ctx.reply(
      `Habit created! 🎉\n\n` +
      `${state.emoji || '✅'} *${safeTitle}*\n` +
      `Frequency: ${state.frequency}${daysInfo}\n` +
      `Target: ${state.target || 1}\n` +
      `Reminder: ${time}\n\n` +
      `View your habits with /habits`,
      { parse_mode: 'Markdown' },
    );

    this.newHabitStates.delete(ctx.from.id);
  }

  private registerTextHandler() {
    this.bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;

      const editState = this.editStates.get(ctx.from.id);
      if (editState) {
        await this.handleEditText(ctx, editState);
        return;
      }

      const noteState = this.noteStates.get(ctx.from.id);
      if (noteState) {
        await this.handleNoteText(ctx, noteState);
        return;
      }

      const newHabitState = this.newHabitStates.get(ctx.from.id);
      if (!newHabitState) return;

      try {
        switch (newHabitState.step) {
          case 'title': {
            newHabitState.title = ctx.message.text.trim();
            newHabitState.step = 'emoji';
            const safeTitle = escapeMarkdown(newHabitState.title);

            await ctx.reply(
              `Pick an emoji icon for *${safeTitle}* or reply with your own:`,
              {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '📚 Read', callback_data: 'emoji_📚' },
                      { text: '🏃 Run', callback_data: 'emoji_🏃' },
                      { text: '💧 Water', callback_data: 'emoji_💧' },
                    ],
                    [
                      { text: '🧘 Meditate', callback_data: 'emoji_🧘' },
                      { text: '💻 Code', callback_data: 'emoji_💻' },
                      { text: '💰 Finance', callback_data: 'emoji_💰' },
                    ],
                    [
                      { text: '🍎 Health', callback_data: 'emoji_🍎' },
                      { text: '💤 Sleep', callback_data: 'emoji_💤' },
                      { text: '🎯 Target', callback_data: 'emoji_🎯' },
                    ],
                    [
                      { text: '🏋️ Gym', callback_data: 'emoji_🏋️' },
                      { text: '✅ Default', callback_data: 'emoji_✅' },
                    ],
                  ],
                },
              },
            );
            break;
          }

          case 'emoji': {
            newHabitState.emoji = ctx.message.text.trim();
            newHabitState.step = 'frequency';
            await ctx.reply(
              'How often will you do this habit?',
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: 'Daily', callback_data: 'freq_DAILY' },
                      { text: 'Weekly', callback_data: 'freq_WEEKLY' },
                      { text: 'Custom Days', callback_data: 'freq_CUSTOM' },
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
              await this.completeHabitCreationWithTime(ctx, newHabitState, time);
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

  private async handleNoteText(ctx: any, noteState: NoteState) {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.usersService.findByTelegramId(telegramId);
      const note = ctx.message.text.trim();

      await this.completionsService.updateNoteToday(noteState.habitId, user.id, note);
      await ctx.reply('Note saved! 📝');
      this.noteStates.delete(ctx.from.id);
    } catch (error: any) {
      await ctx.reply('Could not save note. Make sure the habit was completed today.');
      this.noteStates.delete(ctx.from.id);
    }
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
    const daysInfo = state.selectedDays ? `\nDays: ${state.selectedDays.join(', ')}` : '';
    await ctx.reply(
      `Habit created! 🎉\n\n` +
      `${state.emoji || '✅'} *${safeTitle}*\n` +
      `Frequency: ${state.frequency}${daysInfo}\n` +
      `Target: ${state.target || 1}\n\n` +
      `View your habits with /habits`,
      { parse_mode: 'Markdown' },
    );
  }

  private async createHabit(userId: number, state: NewHabitState) {
    const daysStr = state.selectedDays ? state.selectedDays.join(',') : undefined;
    return this.habitsService.create(userId, {
      title: state.title!,
      emoji: state.emoji,
      frequency: state.frequency!,
      days: daysStr,
      target: state.target,
    });
  }
}
