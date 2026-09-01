import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsInt()
  @Min(1)
  @Max(65_535)
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsOptional()
  NODE_ENV?: string;

  @IsString()
  @IsOptional()
  MONGODB_URI?: string;

  @IsString()
  @IsOptional()
  MONGODB_DB?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== undefined && value !== '')
  @Matches(/^0x[0-9a-fA-F]{40}$/)
  FACTORY_ADDRESS?: string;

  @IsString()
  @IsOptional()
  CHAIN_ID?: string;

  @IsString()
  @IsOptional()
  @Matches(/^0x[0-9a-fA-F]{40}$/)
  REWARDS_DISTRIBUTOR_ADDRESS?: string;

  @IsInt()
  @Min(60)
  @IsOptional()
  REWARDS_EPOCH_DURATION_SEC?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  REWARDS_EPOCH_ZERO_UNIX_SEC?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  REWARDS_FINALITY_DELAY_SEC?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  REWARDS_TICKET_THRESHOLD_USDC?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  REWARDS_WINNER_COUNT?: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  const environment = String(config.NODE_ENV || 'development');
  if (environment === 'production') {
    const required = [
      'MONGODB_URI',
      'MONGODB_DB',
      'FACTORY_ADDRESS',
      'CORS_ORIGINS',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ];
    const missing = required.filter((name) => !String(config[name] || '').trim());
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
    const origins = String(config.CORS_ORIGINS)
      .split(',')
      .map((origin) => origin.trim());
    if (origins.includes('*')) {
      throw new Error('CORS_ORIGINS must be an explicit allowlist in production');
    }
    for (const origin of origins) {
      const url = new URL(origin);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
        throw new Error(`CORS origin must use HTTPS in production: ${origin}`);
      }
    }
  }

  return { ...config, ...validatedConfig };
}
