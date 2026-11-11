/**
 * Utility to estimate download time based on video file size and average internet connection speed.
 */

export function parseFileSizeToBytes(fileSize?: string | number | null): number | null {
  if (fileSize === undefined || fileSize === null) return null;
  if (typeof fileSize === "number") {
    return fileSize > 0 ? fileSize : null;
  }
  const clean = fileSize.trim();
  const match = clean.match(/^([\d.]+)\s*([a-zA-Z]+)?$/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (isNaN(value) || value <= 0) return null;

  const unit = (match[2] || "MB").toUpperCase();
  if (unit === "GB") return Math.round(value * 1024 * 1024 * 1024);
  if (unit === "MB") return Math.round(value * 1024 * 1024);
  if (unit === "KB") return Math.round(value * 1024);
  if (unit === "B" || unit === "BYTES") return Math.round(value);
  return Math.round(value * 1024 * 1024);
}

export interface EstimatedDownloadTimeResult {
  seconds: number;
  formatted: string;
  speedFormatted: string;
}

/**
 * Estimates download time in seconds and returns a formatted representation.
 * @param fileSize File size as string (e.g. "32.6 MB", "840 KB") or byte count
 * @param speedMbps Average internet speed in Mbps (default: 25 Mbps)
 */
export function estimateDownloadTime(
  fileSize?: string | number | null,
  speedMbps: number = 25
): EstimatedDownloadTimeResult | null {
  const bytes = parseFileSizeToBytes(fileSize);
  if (!bytes || bytes <= 0) return null;

  // Convert Mbps to Bytes per second: (speedMbps * 1,000,000) / 8
  const bytesPerSecond = (speedMbps * 1_000_000) / 8;
  const totalSeconds = Math.max(1, Math.round(bytes / bytesPerSecond));

  let formatted = "";
  if (totalSeconds < 60) {
    formatted = `~${totalSeconds}s`;
  } else {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    formatted = remainingSeconds > 0 ? `~${minutes}m ${remainingSeconds}s` : `~${minutes}m`;
  }

  const speedFormatted = `${speedMbps} Mbps`;

  return {
    seconds: totalSeconds,
    formatted,
    speedFormatted,
  };
}
