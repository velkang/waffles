import { NextResponse } from "next/server";
import crypto from "crypto";
import { getOptimizedImageUrl } from "@/lib/image";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate mime type
    const validMimes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
    ];
    if (!validMimes.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported format. Use PNG, JPG, WEBP, or GIF." },
        { status: 400 }
      );
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size exceeds 5MB limit." },
        { status: 400 }
      );
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || (!apiSecret && !uploadPreset)) {
      return NextResponse.json(
        {
          error:
            "Cloudinary credentials missing. Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env",
        },
        { status: 500 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    if (cloudName && apiKey && apiSecret) {
      // Signed upload via Cloudinary API
      const timestamp = Math.floor(Date.now() / 1000);
      const folder = "arc_fun_tokens";
      const paramsToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
      const signature = crypto
        .createHash("sha1")
        .update(paramsToSign)
        .digest("hex");

      const uploadForm = new FormData();
      uploadForm.append("file", base64);
      uploadForm.append("api_key", apiKey);
      uploadForm.append("timestamp", String(timestamp));
      uploadForm.append("folder", folder);
      uploadForm.append("signature", signature);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: uploadForm,
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        console.error("Cloudinary error:", errData);
        throw new Error(
          errData?.error?.message || "Failed to upload image to Cloudinary"
        );
      }

      const data = await res.json();
      const optimizedUrl = getOptimizedImageUrl(data.secure_url, {
        width: 400,
        height: 400,
        quality: 75,
      });

      return NextResponse.json({ url: optimizedUrl });
    } else if (cloudName && uploadPreset) {
      // Unsigned upload via preset
      const uploadForm = new FormData();
      uploadForm.append("file", base64);
      uploadForm.append("upload_preset", uploadPreset);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: uploadForm,
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(
          errData?.error?.message || "Cloudinary upload failed"
        );
      }

      const data = await res.json();
      const optimizedUrl = getOptimizedImageUrl(data.secure_url, {
        width: 400,
        height: 400,
        quality: 75,
      });

      return NextResponse.json({ url: optimizedUrl });
    }
  } catch (err) {
    console.error("Upload route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image upload failed" },
      { status: 500 }
    );
  }
}
