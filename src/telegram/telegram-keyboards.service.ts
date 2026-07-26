import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';

const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function buildProgressBar(percent: number, length = 10): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

@Injectable()
export class TelegramKeyboardsService {
  async sendCustomDaysKeyboard(ctx: Context, selectedDays: string[]): Promise<void> {
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
      `Select active days for your habit:\n\n*Currently Selected:* ${selectedDays.length ? selectedDays.join(', ') : 'None'}`,
      {
        parse_mode: 'Markdown',
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

  async editCustomDaysKeyboard(ctx: Context, selectedDays: string[]): Promise<void> {
    const dayButtons = ALL_DAYS.map((day) => {
      const selected = selectedDays.includes(day);
      return {
        text: `${selected ? '✅' : '⬜'} ${day}`,
        callback_data: `toggle_day_${day}`,
      };
    });

    const row1 = dayButtons.slice(0, 4);
    const row2 = dayButtons.slice(4, 7);

    await ctx.editMessageText(
      `Select active days for your habit:\n\n*Currently Selected:* ${selectedDays.length ? selectedDays.join(', ') : 'None'}`,
      {
        parse_mode: 'Markdown',
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

  async sendTargetKeyboard(ctx: Context): Promise<void> {
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

  async sendReminderTimePresets(ctx: Context, isEdit = false): Promise<void> {
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

  async sendTimeTabSlots(ctx: Context, tab: string): Promise<void> {
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
}
