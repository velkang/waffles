import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class TradesQueryDto {
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
    default: 50,
    minimum: 1,
    maximum: 200,
    description: 'Maximum number of trades to return',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
