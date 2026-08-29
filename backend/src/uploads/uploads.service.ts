import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  ALLOWED_IMAGE_MIMES,
  DEFAULT_CLOUDINARY_FOLDER,
  MAX_UPLOAD_BYTES,
  UploadSignatureResponse,
} from '@waffles/shared';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private readonly configService: ConfigService) {}

  generateSignature(customFolder?: string): UploadSignatureResponse {
    const cloudinaryConfig = this.configService.get('cloudinary');
    const cloudName = cloudinaryConfig?.cloudName;
    const apiKey = cloudinaryConfig?.apiKey;
    const apiSecret = cloudinaryConfig?.apiSecret;
    const uploadPreset = cloudinaryConfig?.uploadPreset;

    if (!cloudName || !apiKey || !apiSecret || !uploadPreset) {
      throw new InternalServerErrorException(
        'Direct uploads require a constrained Cloudinary upload preset',
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    // Enforce fixed folder namespace
    const folder = customFolder && (
      customFolder === DEFAULT_CLOUDINARY_FOLDER ||
      customFolder.startsWith(`${DEFAULT_CLOUDINARY_FOLDER}/`)
    )
      ? customFolder
      : DEFAULT_CLOUDINARY_FOLDER;

    const paramsToSign = `folder=${folder}&timestamp=${timestamp}&upload_preset=${uploadPreset}${apiSecret}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign)
      .digest('hex');

    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder,
      uploadPreset,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      maxSizeBytes: MAX_UPLOAD_BYTES,
      allowedMimeTypes: [...ALLOWED_IMAGE_MIMES],
    };
  }

  async uploadDirectProxy(fileBuffer: Buffer, mimeType: string): Promise<{ url: string }> {
    if (!ALLOWED_IMAGE_MIMES.some((allowed) => allowed === mimeType)) {
      throw new BadRequestException(
        `Unsupported image format. Allowed formats: ${ALLOWED_IMAGE_MIMES.join(', ')}`,
      );
    }

    if (fileBuffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    if (!this.matchesImageSignature(fileBuffer, mimeType)) {
      throw new BadRequestException('File contents do not match the declared image format');
    }

    const cloudinaryConfig = this.configService.get('cloudinary');
    const cloudName = cloudinaryConfig?.cloudName;
    const apiKey = cloudinaryConfig?.apiKey;
    const apiSecret = cloudinaryConfig?.apiSecret;
    const uploadPreset = cloudinaryConfig?.uploadPreset;

    if (!cloudName || (!apiSecret && !uploadPreset)) {
      throw new InternalServerErrorException(
        'Cloudinary credentials are not configured',
      );
    }

    const base64 = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

    if (cloudName && apiKey && apiSecret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = DEFAULT_CLOUDINARY_FOLDER;
      const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      const signature = crypto
        .createHash('sha1')
        .update(paramsToSign)
        .digest('hex');

      const formData = new FormData();
      formData.append('file', base64);
      formData.append('api_key', apiKey);
      formData.append('timestamp', String(timestamp));
      formData.append('folder', folder);
      formData.append('signature', signature);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        this.logger.error('Cloudinary upload failed:', err);
        throw new InternalServerErrorException('Failed to upload image to Cloudinary');
      }

      const data = (await res.json()) as { secure_url: string };
      return { url: data.secure_url };
    } else if (cloudName && uploadPreset) {
      const formData = new FormData();
      formData.append('file', base64);
      formData.append('upload_preset', uploadPreset);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!res.ok) {
        throw new InternalServerErrorException('Failed to upload image to Cloudinary');
      }

      const data = (await res.json()) as { secure_url: string };
      return { url: data.secure_url };
    }

    throw new InternalServerErrorException('Cloudinary upload configuration incomplete');
  }

  private matchesImageSignature(buffer: Buffer, mimeType: string): boolean {
    if (buffer.length < 12) return false;
    if (mimeType === 'image/png') {
      return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/gif') {
      const header = buffer.subarray(0, 6).toString('ascii');
      return header === 'GIF87a' || header === 'GIF89a';
    }
    if (mimeType === 'image/webp') {
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  }
}
