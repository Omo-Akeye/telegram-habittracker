import { IsOptional, IsNumber, Min, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompletionDto {
  @ApiPropertyOptional({ example: 1.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({ example: 'Completed 5km run today!' })
  @IsString()
  @IsOptional()
  note?: string;
}
