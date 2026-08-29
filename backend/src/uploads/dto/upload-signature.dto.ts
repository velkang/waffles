import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UploadSignatureDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Custom folder prefix (will still be constrained within allowed namespace)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^arc_fun_tokens(?:\/[a-zA-Z0-9_-]{1,64})?$/, {
    message: 'folder must remain inside the arc_fun_tokens namespace',
  })
  folder?: string;
}
