import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CandlesQueryDto {
  @ApiProperty({
    type: String,
    description: 'Token contract address (0x...)',
    example: '0x1111111111111111111111111111111111111111',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, { message: 'token must be a valid 0x Ethereum address' })
  token: string;

  @ApiPropertyOptional({
    type: Number,
    default: 60,
    minimum: 10,
    maximum: 86400,
    description: 'Candle timeframe interval in seconds (e.g. 60 for 1m, 300 for 5m, 900 for 15m)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(86400)
  interval?: number = 60;

  @ApiPropertyOptional({
    type: Number,
    default: 240,
    minimum: 1,
    maximum: 1000,
    description: 'Maximum number of candle bars to return',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 240;
}
