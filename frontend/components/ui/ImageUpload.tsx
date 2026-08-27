"use client";

import { useState, useRef } from "react";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
}

export function ImageUpload({ value, onChange }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError("");

    // Validation
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      setError("Please select a PNG, JPG, WEBP, or GIF image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be under 5MB.");
      return;
    }

    // Instant local preview while uploading
    const localPreview = URL.createObjectURL(file);
    onChange(localPreview);

    // Upload to /api/upload (Cloudinary)
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      onChange(data.url);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-1.5 font-mono">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          TOKEN IMAGE / ICON *
        </label>
        {value && !uploading && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-[10px] text-red-400 hover:text-red-300 font-bold"
          >
            Remove
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
        className="hidden"
        onChange={handleInputChange}
      />

      {value ? (
        /* Preview Card */
        <div
          onClick={() => inputRef.current?.click()}
          className="group relative flex items-center gap-3.5 rounded-[8px] bg-[#1a1b21] border border-[#24262e] p-2.5 cursor-pointer hover:border-[#db9d6a] transition"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Upload preview"
            className="h-14 w-14 rounded-[6px] object-cover bg-[#0e0f12] border border-[#24262e] shrink-0"
          />

          <div className="min-w-0 flex-1 text-xs">
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>Image Attached</span>
              {uploading ? (
                <span className="text-[10px] text-[#db9d6a] animate-pulse">
                  • Uploading…
                </span>
              ) : (
                <span className="text-[10px] text-[#4ade80]">✓ Ready</span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 truncate font-sans">
              Click to replace with another image
            </p>
          </div>
        </div>
      ) : (
        /* Empty Dropzone */
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-2 rounded-[8px] border-2 border-dashed p-6 text-center cursor-pointer transition ${
            isDragging
              ? "border-[#db9d6a] bg-[#3b2718]/30"
              : "border-[#24262e] bg-[#1a1b21] hover:border-[#db9d6a] hover:bg-[#1f2027]"
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#141519] border border-[#24262e] text-[#db9d6a]">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>

          <div>
            <span className="text-xs font-bold text-white block">
              Click to select or drag & drop image
            </span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">
              PNG, JPG, WEBP, or GIF (max 5MB)
            </span>
          </div>
        </div>
      )}

      {error && <p className="text-[10px] text-red-400 font-bold">{error}</p>}
    </div>
  );
}
