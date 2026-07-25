import { IsOptional, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompletionDto {
  @ApiPropertyOptional({ example: 1.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  value?: number;
}
