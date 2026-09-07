import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export enum LaunchSortOrder {
  NEW = 'new',
  MCAP = 'mcap',
  VOLUME = 'volume',
  TRENDING = 'trending',
  GRADUATING = 'graduating',
  GRADUATED = 'graduated',
}

export class LaunchesQueryDto {
  @ApiPropertyOptional({
    enum: LaunchSortOrder,
    default: LaunchSortOrder.NEW,
    description: 'Sorting strategy for launches list',
  })
  @IsOptional()
  @IsEnum(LaunchSortOrder)
  sort?: LaunchSortOrder = LaunchSortOrder.NEW;

  @ApiPropertyOptional({
    type: Number,
    default: 50,
    minimum: 1,
    maximum: 500,
    description: 'Maximum items to return',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @ApiPropertyOptional({
    type: String,
    description: 'Optional token contract address to query single launch',
  })
  @IsOptional()
  @IsString()
  @Matches(/^0x[0-9a-fA-F]{40}$/, { message: 'token must be a valid 0x Ethereum address' })
  token?: string;
}
