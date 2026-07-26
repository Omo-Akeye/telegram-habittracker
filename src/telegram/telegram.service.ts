import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { TelegramCommandsHandler } from './telegram-commands.handler';
import { TelegramCallbacksHandler } from './telegram-callbacks.handler';
import { escapeMarkdown } from '../common/utils/escape-markdown';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;

  constructor(
    private readonly configService: ConfigService,
    private readonly commandsHandler: TelegramCommandsHandler,
    private readonly callbacksHandler: TelegramCallbacksHandler,
  ) {
    const token = this.configService.get<string>('BOT_TOKEN');
    if (!token) {
      throw new Error('BOT_TOKEN is not defined');
    }
    this.bot = new Telegraf(token);
  }

  async onModuleInit(): Promise<void> {
    this.registerErrorHandler();
    this.commandsHandler.registerCommands(this.bot);
    this.callbacksHandler.registerActions(this.bot);
    this.commandsHandler.registerTextHandler(this.bot);
    await this.setupBotCommands();

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (!isProduction) {
      await this.bot.launch();
      this.logger.log('Bot started in polling mode');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Stopping bot instance...');
    this.bot.stop('SIGTERM');
  }

  private async setupBotCommands(): Promise<void> {
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

  private registerErrorHandler(): void {
    this.bot.catch((err: unknown, ctx: unknown) => {
      this.logger.error(`Unhandled error while processing update`, err);
    });
  }

  async handleUpdate(update: Record<string, unknown>): Promise<void> {
    try {
      await this.bot.handleUpdate(update as any);
    } catch (error) {
      this.logger.error('Error handling update', error);
    }
  }

  async sendReminder(telegramId: string, habit: { title: string; emoji?: string }, reminderId: number): Promise<void> {
    const safeTitle = escapeMarkdown(habit.title || '');
    await this.bot.telegram.sendMessage(
      telegramId,
      `${habit.emoji || '✅'} *${safeTitle}*\n\nHave you completed today's habit?`,
      {
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
      },
    );
  }
}
