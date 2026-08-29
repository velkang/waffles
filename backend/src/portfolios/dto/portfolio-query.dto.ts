import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class PortfolioQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Wallet address (0x...)',
    example: '0x1234567890123456789012345678901234567890',
  })
  @IsOptional()
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, { message: 'address must be a valid 0x Ethereum address' })
  address?: string;
}
