/**
 * Utility to format and optimize image URLs with dynamic transformation parameters
 * (width, height, fit=cover, quality=75, format=auto) similar to Cloudflare/Cloudinary pipelines.
 */
export function getOptimizedImageUrl(
  rawUri?: string | null,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
  }
): string {
  if (!rawUri || typeof rawUri !== "string") return "";

  const { width = 300, height = 300, quality = 75 } = options || {};

  // Cloudinary Dynamic Transformation Pattern
  if (rawUri.includes("res.cloudinary.com") && rawUri.includes("/upload/")) {
    const transformSegment = `c_fill,w_${width},h_${height},q_${quality},f_auto`;
    // If transformations are already present, replace them; otherwise inject after /upload/
    if (rawUri.includes("/upload/c_fill,")) {
      return rawUri.replace(
        /\/upload\/c_fill,[^/]+\//,
        `/upload/${transformSegment}/`
      );
    }
    return rawUri.replace("/upload/", `/upload/${transformSegment}/`);
  }

  // Cloudflare R2 / cdn-cgi pattern (like nad.fun)
  if (rawUri.includes("/cdn-cgi/image/")) {
    return rawUri.replace(
      /\/cdn-cgi\/image\/[^/]+\//,
      `/cdn-cgi/image/width=${width},height=${height},fit=cover,quality=${quality},format=auto/`
    );
  }

  return rawUri;
}
