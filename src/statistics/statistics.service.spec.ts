import { Test, TestingModule } from '@nestjs/testing';
import { StatisticsService } from './statistics.service';
import { PrismaService } from '../prisma/prisma.service';
import { HabitsService } from '../habits/habits.service';
import { CompletionsService } from '../completions/completions.service';
import { Frequency } from '@prisma/client';

describe('StatisticsService', () => {
  let service: StatisticsService;

  const mockPrisma = {
    completion: {
      findMany: jest.fn(),
    },
  };

  const mockHabitsService = {
    findAllForUserRaw: jest.fn(),
  };

  const mockCompletionsService = {
    countToday: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HabitsService, useValue: mockHabitsService },
        { provide: CompletionsService, useValue: mockCompletionsService },
      ],
    }).compile();

    service = module.get<StatisticsService>(StatisticsService);
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    it('should return aggregated user statistics', async () => {
      mockHabitsService.findAllForUserRaw.mockResolvedValue([
        { id: 1, archived: false, frequency: Frequency.DAILY, days: null },
      ]);
      mockCompletionsService.countToday.mockResolvedValue(1);
      mockPrisma.completion.findMany.mockResolvedValue([
        { habitId: 1, date: '2026-07-26' },
      ]);

      const stats = await service.getStats(1);

      expect(stats.totalHabits).toBe(1);
      expect(stats.todayCompleted).toBe(1);
      expect(stats.completionRate).toBe(100);
    });
  });
});
