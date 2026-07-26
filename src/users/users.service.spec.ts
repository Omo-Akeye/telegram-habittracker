import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('findByTelegramId', () => {
    it('should return user if found', async () => {
      const mockUser = { id: 1, telegramId: '12345' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByTelegramId('12345');
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findByTelegramId('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOrCreate', () => {
    it('should upsert user with latest profile info', async () => {
      const mockUser = { id: 1, telegramId: '12345', username: 'john', firstName: 'John' };
      mockPrisma.user.upsert.mockResolvedValue(mockUser);

      const result = await service.findOrCreate('12345', 'john', 'John');
      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
        where: { telegramId: '12345' },
        update: { username: 'john', firstName: 'John' },
        create: { telegramId: '12345', username: 'john', firstName: 'John' },
      });
    });
  });
});
