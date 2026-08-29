import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { UploadSignatureDto } from './dto/upload-signature.dto';
import { MAX_UPLOAD_BYTES } from '@waffles/shared';

const uploadRateLimit = Math.max(1, Number(process.env.UPLOAD_RATE_LIMIT_MAX) || 20);
const uploadRateTtl = Math.max(1_000, Number(process.env.RATE_LIMIT_TTL_MS) || 60_000);

type UploadedImage = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@ApiTags('Uploads')
@Controller()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post(['v1/uploads/signature', 'v1/upload/signature'])
  @Throttle({ default: { limit: uploadRateLimit, ttl: uploadRateTtl } })
  @ApiOperation({ summary: 'Generate a short-lived signature for direct browser upload to Cloudinary' })
  @ApiResponse({ status: 201, description: 'Signed upload parameters' })
  generateSignature(@Body() dto: UploadSignatureDto) {
    return this.uploadsService.generateSignature(dto.folder);
  }

  @Post(['v1/uploads', 'v1/upload'])
  @Throttle({ default: { limit: uploadRateLimit, ttl: uploadRateTtl } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Fallback proxied image upload endpoint (max 5MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Uploaded image URL' })
  async uploadFile(@UploadedFile() file?: UploadedImage) {
    if (!file) throw new BadRequestException('image file is required');
    return this.uploadsService.uploadDirectProxy(file.buffer, file.mimetype);
  }
}
