import { IsString, IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Frequency } from '@prisma/client';

export class CreateHabitDto {
  @ApiProperty({ example: 'Read 30 minutes' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: '📚' })
  @IsString()
  @IsOptional()
  emoji?: string;

  @ApiProperty({ enum: Frequency, example: Frequency.DAILY })
  @IsEnum(Frequency)
  frequency: Frequency;

  @ApiPropertyOptional({ example: 'MON,WED,FRI' })
  @IsString()
  @IsOptional()
  days?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  target?: number;
}
