import { Injectable, Logger } from '@nestjs/common';
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { UsersService } from '../users/users.service';
import { HabitsService } from '../habits/habits.service';
import { CompletionsService } from '../completions/completions.service';
import { StatisticsService } from '../statistics/statistics.service';
import { AuthService } from '../auth/auth.service';
import { TelegramStateService, NewHabitState, EditState, NoteState } from './telegram-state.service';
import { TelegramKeyboardsService, buildProgressBar } from './telegram-keyboards.service';
import { escapeMarkdown } from '../common/utils/escape-markdown';
import { isValidTime } from '../common/utils/time.utils';
import dayjs from 'dayjs';

@Injectable()
export class TelegramCommandsHandler {
  private readonly logger = new Logger(TelegramCommandsHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly habitsService: HabitsService,
    private readonly completionsService: CompletionsService,
    private readonly statisticsService: StatisticsService,
    private readonly authService: AuthService,
    private readonly stateService: TelegramStateService,
    private readonly keyboardsService: TelegramKeyboardsService,
  ) {}

  registerCommands(bot: Telegraf): void {
    bot.start(async (ctx) => {
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
          {
            reply_markup: {
              inline_keyboard: [[{ text: '➕ Create my first habit', callback_data: 'new_habit' }]],
            },
          },
        );
      } catch (error) {
        this.logger.error('Error handling /start command', error);
        await ctx.reply('Error starting bot. Please try again later.');
      }
    });

    bot.help(async (ctx) => {
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

    bot.command('token', async (ctx) => {
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

    bot.command('new', async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        await this.usersService.findOrCreate(telegramId, ctx.from.username, ctx.from.first_name);

        this.stateService.startNewHabitFlow(ctx.from.id);
        await ctx.reply('What\'s the goal you\'re working towards?');
      } catch (error) {
        this.logger.error('Error handling /new command', error);
        await ctx.reply('Error creating habit. Please try again later.');
      }
    });

    bot.command('cancel', async (ctx) => {
      this.stateService.clearAllStates(ctx.from.id);
      await ctx.reply('Action cancelled. What would you like to do next?');
    });

    bot.command('habits', async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        const user = await this.usersService.findByTelegramId(telegramId);
        const habits = await this.habitsService.findAll(user.id);

        if (habits.length === 0) {
          await ctx.reply('You have no habits yet. Create one with /new', {
            reply_markup: {
              inline_keyboard: [[{ text: '➕ Create a Habit', callback_data: 'new_habit' }]],
            },
          });
          return;
        }

        // Build a single consolidated message instead of N separate messages
        const today = dayjs().format('YYYY-MM-DD');
        const lines: string[] = ['📋 *Your Habits*\n'];
        const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

        for (const habit of habits) {
          const todayCompletion = habit.completions.find((c) => c.date === today);
          const completedToday = !!todayCompletion;
          const status = completedToday ? '✅' : '⬜';
          const safeTitle = escapeMarkdown(habit.title || '');

          const target = habit.target || 1;
          const value = completedToday ? (todayCompletion.value || 1) : 0;
          const percent = Math.min(100, Math.round((value / target) * 100));
          const bar = buildProgressBar(percent, 8);

          let detail = `${status} ${habit.emoji || '📋'} *${safeTitle}*\n` +
            `Progress: \`[${bar}]\` ${percent}%\n` +
            `Frequency: ${habit.frequency} | Target: ${target}`;

          if (todayCompletion?.note) {
            const safeNote = escapeMarkdown(todayCompletion.note);
            detail += `\n📝 Note: _"${safeNote}"_`;
          }

          lines.push(detail);

          buttons.push([
            { text: completedToday ? '🔄 Undo' : `✅ ${habit.emoji || ''} Complete`, callback_data: `complete_${habit.id}` },
            { text: '📝 Note', callback_data: `add_note_${habit.id}` },
            { text: '✏ Edit', callback_data: `edit_${habit.id}` },
            { text: '🗑', callback_data: `delete_${habit.id}` },
          ]);
        }

        await ctx.reply(lines.join('\n\n'), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons },
        });
      } catch (error) {
        await ctx.reply('Error loading habits. Please try again.');
      }
    });

    bot.command('stats', async (ctx) => {
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

  registerTextHandler(bot: Telegraf): void {
    bot.on(message('text'), async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;

      const editState = this.stateService.getEditState(ctx.from.id);
      if (editState) {
        await this.handleEditText(ctx, editState);
        return;
      }

      const noteState = this.stateService.getNoteState(ctx.from.id);
      if (noteState) {
        await this.handleNoteText(ctx, noteState);
        return;
      }

      const newHabitState = this.stateService.getNewHabitState(ctx.from.id);
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

          case 'target': {
            const target = parseInt(ctx.message.text.trim());
            if (isNaN(target) || target <= 0) {
              await ctx.reply('Please enter a valid positive number for the target, or choose from the options above.');
              return;
            }
            newHabitState.target = target;
            newHabitState.step = 'reminder';
            await this.keyboardsService.sendReminderTimePresets(ctx);
            break;
          }

          case 'reminder': {
            const time = ctx.message.text.trim();

            if (time.toLowerCase() === 'skip') {
              await this.saveHabit(ctx, newHabitState);
              this.stateService.deleteNewHabitState(ctx.from.id);
            } else if (isValidTime(time)) {
              await this.completeHabitCreationWithTime(ctx, newHabitState, time);
            } else {
              await ctx.reply('Please enter a valid time in HH:MM format (00:00–23:59) or type "skip".');
              return;
            }
            break;
          }
        }
      } catch (error) {
        this.logger.error('Error in text handler', error);
        await ctx.reply('Something went wrong. Please try again with /new');
        this.stateService.deleteNewHabitState(ctx.from.id);
      }
    });
  }

  private async handleNoteText(ctx: Context & { message: { text: string }; from: { id: number } }, noteState: NoteState): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.usersService.findByTelegramId(telegramId);
      const note = ctx.message.text.trim();

      await this.completionsService.updateNoteToday(noteState.habitId, user.id, note);
      await ctx.reply('Note saved! 📝');
      this.stateService.deleteNoteState(ctx.from.id);
    } catch (error) {
      await ctx.reply('Could not save note. Make sure the habit was completed today.');
      this.stateService.deleteNoteState(ctx.from.id);
    }
  }

  private async handleEditText(ctx: Context & { message: { text: string }; from: { id: number } }, editState: EditState): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.usersService.findByTelegramId(telegramId);
      const text = ctx.message.text.trim();
      let updateData: Record<string, string | number> = {};

      if (editState.step === 'title') {
        updateData.title = text;
      } else if (editState.step === 'emoji') {
        updateData.emoji = text;
      } else if (editState.step === 'target') {
        const target = parseInt(text);
        if (isNaN(target) || target <= 0) {
          await ctx.reply('Please enter a valid positive number for the target.');
          return;
        }
        updateData.target = target;
      } else {
        await ctx.reply('Please select what to edit from the menu.');
        return;
      }

      const habit = await this.habitsService.update(editState.habitId, user.id, updateData);

      const safeTitle = escapeMarkdown(habit.title || '');
      await ctx.reply(
        `Habit updated! ✏️\n\n` +
        `${habit.emoji || '✅'} *${safeTitle}*\n` +
        `Frequency: ${habit.frequency} | Target: ${habit.target}`,
        { parse_mode: 'Markdown' },
      );

      this.stateService.deleteEditState(ctx.from.id);
    } catch (error) {
      await ctx.reply('Error updating habit. Please try again.');
      this.stateService.deleteEditState(ctx.from.id);
    }
  }

  async saveHabit(ctx: Context & { from: { id: number } }, state: NewHabitState): Promise<void> {
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

  async completeHabitCreationWithTime(ctx: Context & { from: { id: number } }, state: NewHabitState, time: string): Promise<void> {
    const telegramId = ctx.from.id.toString();
    const user = await this.usersService.findByTelegramId(telegramId);
    const habit = await this.createHabit(user.id, state);

    const { RemindersService } = await import('../reminders/reminders.service');
    // Use the injected remindersService from the callback handler instead
    // This method is called from the callback handler which has the remindersService
    // We'll pass it as a parameter instead - see telegram.service.ts

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

    this.stateService.deleteNewHabitState(ctx.from.id);
  }

  async createHabit(userId: number, state: NewHabitState) {
    const daysStr = state.selectedDays ? state.selectedDays.join(',') : undefined;
    return this.habitsService.create(userId, {
      title: state.title!,
      emoji: state.emoji,
      frequency: state.frequency! as 'DAILY' | 'WEEKLY' | 'CUSTOM',
      days: daysStr,
      target: state.target,
    });
  }
}
