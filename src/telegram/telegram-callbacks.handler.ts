import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Telegraf, Context } from 'telegraf';
import { UsersService } from '../users/users.service';
import { HabitsService } from '../habits/habits.service';
import { CompletionsService } from '../completions/completions.service';
import { StatisticsService } from '../statistics/statistics.service';
import { RemindersService } from '../reminders/reminders.service';
import { TelegramStateService, NewHabitState } from './telegram-state.service';
import { TelegramKeyboardsService } from './telegram-keyboards.service';
import { TelegramCommandsHandler } from './telegram-commands.handler';
import { Frequency } from '@prisma/client';
import dayjs from 'dayjs';

@Injectable()
export class TelegramCallbacksHandler {
  private readonly logger = new Logger(TelegramCallbacksHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly habitsService: HabitsService,
    private readonly completionsService: CompletionsService,
    private readonly statisticsService: StatisticsService,
    @Inject(forwardRef(() => RemindersService))
    private readonly remindersService: RemindersService,
    private readonly stateService: TelegramStateService,
    private readonly keyboardsService: TelegramKeyboardsService,
    private readonly commandsHandler: TelegramCommandsHandler,
  ) {}

  registerActions(bot: Telegraf): void {
    bot.action('new_habit', async (ctx) => {
      try {
        const telegramId = ctx.from.id.toString();
        await this.usersService.findOrCreate(telegramId, ctx.from.username, ctx.from.first_name);

        this.stateService.startNewHabitFlow(ctx.from.id);
        await ctx.answerCbQuery();
        await ctx.reply('What\'s the goal you\'re working towards?');
      } catch (error) {
        this.logger.error('Error handling new_habit action', error);
        await ctx.answerCbQuery('Error starting new habit flow');
      }
    });

    bot.action(/emoji_(.+)/, async (ctx) => {
      const emoji = ctx.match[1];
      const state = this.stateService.getNewHabitState(ctx.from.id);
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

    bot.action(/freq_(.+)/, async (ctx) => {
      const frequency = ctx.match[1] as Frequency;
      const state = this.stateService.getNewHabitState(ctx.from.id);

      if (state && state.step === 'frequency') {
        state.frequency = frequency;
        await ctx.answerCbQuery();

        if (frequency === Frequency.CUSTOM) {
          state.selectedDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
          state.step = 'custom_days';
          await this.keyboardsService.sendCustomDaysKeyboard(ctx, state.selectedDays);
        } else {
          state.step = 'target';
          await this.keyboardsService.sendTargetKeyboard(ctx);
        }
      }
    });

    bot.action(/toggle_day_(.+)/, async (ctx) => {
      const day = ctx.match[1];
      const state = this.stateService.getNewHabitState(ctx.from.id);
      if (state && state.step === 'custom_days' && state.selectedDays) {
        if (state.selectedDays.includes(day)) {
          state.selectedDays = state.selectedDays.filter((d) => d !== day);
        } else {
          state.selectedDays.push(day);
        }
        await ctx.answerCbQuery();
        await this.keyboardsService.editCustomDaysKeyboard(ctx, state.selectedDays);
      }
    });

    bot.action('confirm_days', async (ctx) => {
      const state = this.stateService.getNewHabitState(ctx.from.id);
      if (state && state.step === 'custom_days') {
        if (!state.selectedDays || state.selectedDays.length === 0) {
          await ctx.answerCbQuery('Please select at least 1 day!');
          return;
        }
        state.step = 'target';
        await ctx.answerCbQuery();
        await this.keyboardsService.sendTargetKeyboard(ctx);
      }
    });

    bot.action(/target_(\d+)/, async (ctx) => {
      const target = parseInt(ctx.match[1]);
      const state = this.stateService.getNewHabitState(ctx.from.id);
      if (state && state.step === 'target') {
        state.target = target;
        state.step = 'reminder';
        await ctx.answerCbQuery();
        await this.keyboardsService.sendReminderTimePresets(ctx);
      }
    });

    bot.action(/time_preset_(.+)/, async (ctx) => {
      const time = ctx.match[1];
      const state = this.stateService.getNewHabitState(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await this.completeHabitCreationWithTime(ctx, state, time);
      }
    });

    bot.action(/time_tab_(.+)/, async (ctx) => {
      const tab = ctx.match[1];
      const state = this.stateService.getNewHabitState(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await this.keyboardsService.sendTimeTabSlots(ctx, tab);
      }
    });

    bot.action('time_presets_home', async (ctx) => {
      const state = this.stateService.getNewHabitState(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await this.keyboardsService.sendReminderTimePresets(ctx, true);
      }
    });

    bot.action('time_custom', async (ctx) => {
      const state = this.stateService.getNewHabitState(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await ctx.reply('Please reply with your reminder time in HH:MM format (24h), e.g. 07:30 or 21:00.');
      }
    });

    bot.action('time_skip', async (ctx) => {
      const state = this.stateService.getNewHabitState(ctx.from.id);
      if (state && state.step === 'reminder') {
        await ctx.answerCbQuery();
        await this.commandsHandler.saveHabit(ctx as any, state);
        this.stateService.deleteNewHabitState(ctx.from.id);
      }
    });

    bot.action(/complete_(\d+)/, async (ctx) => {
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
      } catch (error) {
        await ctx.answerCbQuery('Error completing habit');
      }
    });

    bot.action(/undo_(\d+)/, async (ctx) => {
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
      } catch (error) {
        await ctx.answerCbQuery('Error undoing completion');
      }
    });

    bot.action(/add_note_(\d+)/, async (ctx) => {
      const habitId = parseInt(ctx.match[1]);
      this.stateService.setNoteState(ctx.from.id, { habitId, createdAt: Date.now() });
      await ctx.answerCbQuery();
      await ctx.reply('📝 Reply with a note or reflection for today\'s habit entry:');
    });

    bot.action(/edit_title_(\d+)/, async (ctx) => {
      const habitId = parseInt(ctx.match[1]);
      this.stateService.setEditState(ctx.from.id, { habitId, step: 'title', createdAt: Date.now() });
      await ctx.answerCbQuery();
      await ctx.editMessageText('Enter a new title for this habit:');
    });

    bot.action(/edit_emoji_(\d+)/, async (ctx) => {
      const habitId = parseInt(ctx.match[1]);
      this.stateService.setEditState(ctx.from.id, { habitId, step: 'emoji', createdAt: Date.now() });
      await ctx.answerCbQuery();
      await ctx.editMessageText('Reply with a new emoji icon for this habit:');
    });

    bot.action(/edit_target_(\d+)/, async (ctx) => {
      const habitId = parseInt(ctx.match[1]);
      this.stateService.setEditState(ctx.from.id, { habitId, step: 'target', createdAt: Date.now() });
      await ctx.answerCbQuery();
      await ctx.editMessageText('Reply with a new target number (e.g., 5):');
    });

    bot.action(/edit_(\d+)/, async (ctx) => {
      const habitId = parseInt(ctx.match[1]);
      this.stateService.startEditFlow(ctx.from.id, habitId);
      await ctx.answerCbQuery();
      await ctx.editMessageText('What would you like to edit?', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✏️ Title', callback_data: `edit_title_${habitId}` },
              { text: '😊 Emoji', callback_data: `edit_emoji_${habitId}` },
            ],
            [
              { text: '🎯 Target', callback_data: `edit_target_${habitId}` },
            ],
          ],
        },
      });
    });

    bot.action(/delete_(\d+)/, async (ctx) => {
      try {
        const habitId = parseInt(ctx.match[1]);
        const telegramId = ctx.from.id.toString();
        const user = await this.usersService.findByTelegramId(telegramId);

        await this.habitsService.remove(habitId, user.id);
        await ctx.answerCbQuery('Habit deleted 🗑');
        await ctx.deleteMessage();
      } catch (error) {
        await ctx.answerCbQuery('Error deleting habit');
      }
    });

    bot.action(/complete_reminder_(\d+)/, async (ctx) => {
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
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Undo', callback_data: `undo_${reminder.habitId}` }]
              ]
            }
          },
        );
      } catch (error) {
        await ctx.answerCbQuery('Error completing habit');
      }
    });

    // Specific regex for snooze options: snooze_<minutes>_<reminderId>
    bot.action(/^snooze_(\d+)_(\d+)$/, async (ctx) => {
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
      } catch (error) {
        await ctx.answerCbQuery('Error snoozing');
      }
    });

    // Generic snooze prompt regex: snooze_reminder_<reminderId>
    bot.action(/^snooze_reminder_(\d+)$/, async (ctx) => {
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

    bot.action(/skip_reminder_(\d+)/, async (ctx) => {
      try {
        const reminderId = parseInt(ctx.match[1]);

        const log = await this.remindersService.findTodayLog(reminderId);
        if (log) {
          await this.remindersService.markSkipped(log.id);
        }

        await ctx.answerCbQuery();
        await ctx.editMessageText('No worries 🌱\n\nTomorrow is another chance.');
      } catch (error) {
        await ctx.answerCbQuery('Error skipping');
      }
    });
  }

  private async completeHabitCreationWithTime(ctx: Context & { from: { id: number } }, state: NewHabitState, time: string): Promise<void> {
    const telegramId = ctx.from.id.toString();
    const user = await this.usersService.findByTelegramId(telegramId);
    const habit = await this.commandsHandler.createHabit(user.id, state);

    await this.remindersService.create(habit.id, user.id, time);
    await this.commandsHandler.completeHabitCreationWithTime(ctx, state, time);
  }
}
