import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReminderDto {
  @ApiProperty({ example: '09:00', description: 'Time in HH:MM format (24h)' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:MM format (24h)' })
  time: string;
}
