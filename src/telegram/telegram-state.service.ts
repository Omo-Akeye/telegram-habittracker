import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface NewHabitState {
  step: 'title' | 'emoji' | 'frequency' | 'custom_days' | 'target' | 'reminder';
  title?: string;
  emoji?: string;
  frequency?: string;
  selectedDays?: string[];
  target?: number;
  createdAt: number;
}

export interface EditState {
  habitId: number;
  step?: 'menu' | 'title' | 'emoji' | 'target';
  createdAt: number;
}

export interface NoteState {
  habitId: number;
  createdAt: number;
}

@Injectable()
export class TelegramStateService {
  private readonly logger = new Logger(TelegramStateService.name);
  private readonly newHabitStates = new Map<number, NewHabitState>();
  private readonly editStates = new Map<number, EditState>();
  private readonly noteStates = new Map<number, NoteState>();

  constructor() {
    this.logger.warn(
      'Conversation state is stored in-memory. State will be lost on server restart. ' +
      'Consider using Redis or a database for production deployments.',
    );
  }

  // --- NewHabitState ---
  getNewHabitState(userId: number): NewHabitState | undefined {
    return this.newHabitStates.get(userId);
  }

  setNewHabitState(userId: number, state: NewHabitState): void {
    this.newHabitStates.set(userId, state);
  }

  deleteNewHabitState(userId: number): void {
    this.newHabitStates.delete(userId);
  }

  // --- EditState ---
  getEditState(userId: number): EditState | undefined {
    return this.editStates.get(userId);
  }

  setEditState(userId: number, state: EditState): void {
    this.editStates.set(userId, state);
  }

  deleteEditState(userId: number): void {
    this.editStates.delete(userId);
  }

  // --- NoteState ---
  getNoteState(userId: number): NoteState | undefined {
    return this.noteStates.get(userId);
  }

  setNoteState(userId: number, state: NoteState): void {
    this.noteStates.set(userId, state);
  }

  deleteNoteState(userId: number): void {
    this.noteStates.delete(userId);
  }

  // --- Clear all states for a user ---
  clearAllStates(userId: number): void {
    this.newHabitStates.delete(userId);
    this.editStates.delete(userId);
    this.noteStates.delete(userId);
  }

  // --- Start a new habit flow (clears other states) ---
  startNewHabitFlow(userId: number): void {
    this.editStates.delete(userId);
    this.noteStates.delete(userId);
    this.newHabitStates.set(userId, { step: 'title', createdAt: Date.now() });
  }

  // --- Start an edit flow (clears other states) ---
  startEditFlow(userId: number, habitId: number): void {
    this.newHabitStates.delete(userId);
    this.noteStates.delete(userId);
    this.editStates.set(userId, { habitId, step: 'menu', createdAt: Date.now() });
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  cleanStaleStates(): void {
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
}
