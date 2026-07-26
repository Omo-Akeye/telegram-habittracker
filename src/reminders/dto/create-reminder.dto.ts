import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { isValidTime } from '../../common/utils/time.utils';
import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';

export class CreateReminderDto {
  @ApiProperty({ example: '09:00', description: 'Time in HH:MM format (24h), 00:00–23:59' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:MM format (24h)' })
  @Transform(({ value }) => {
    if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) && !isValidTime(value)) {
      throw new BadRequestException('Time must be a valid time between 00:00 and 23:59');
    }
    return value;
  })
  time: string;
}
