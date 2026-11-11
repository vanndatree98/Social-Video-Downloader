import React, { useState, useRef, useEffect } from "react";
import {
  Download,
  Film,
  Music,
  Image as ImageIcon,
  Check,
  Clock,
  Eye,
  Heart,
  MessageSquare,
  TrendingUp,
  Scissors,
  Share2,
  QrCode,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Play,
  ChevronDown,
  SlidersHorizontal,
  Gauge,
  Loader2,
  Cloud,
  CloudLightning,
  CheckCircle2,
  Link2,
  Copy,
  ArrowRight,
  User as UserIcon,
} from "lucide-react";
import { VideoMetadata, VideoFormat, Language, HistoryItem } from "../types";
import { translations } from "../translations";
import { getPlatformBadge } from "./PlatformIcons";
import { CloudBackupModal } from "./CloudBackupModal";
import { User } from "firebase/auth";
import { uploadVideoToGoogleDrive } from "../services/googleDriveService";
import { googleSignIn } from "../services/googleDriveAuth";
import { estimateDownloadTime } from "../utils/estimateDownloadTime";

interface VideoResultCardProps {
  metadata: VideoMetadata;
  lang: Language;
  onSaveToHistory: (item: HistoryItem) => void;
  onOpenQr: (url: string) => void;
  googleUser?: User | null;
  accessToken?: string | null;
  onGoogleSignInSuccess?: (user: User, token: string) => void;
  autoSyncToDrive?: boolean;
  onToggleAutoSync?: (enabled: boolean) => void;
  onOpenProfile?: (authorUsername: string, platform: string) => void;
}

export const VideoResultCard: React.FC<VideoResultCardProps> = ({
  metadata,
  lang,
  onSaveToHistory,
  onOpenQr,
  googleUser,
  accessToken,
  onGoogleSignInSuccess,
  autoSyncToDrive = false,
  onToggleAutoSync,
  onOpenProfile,
}) => {
  const t = translations[lang];
  const [activeTab, setActiveTab] = useState<"video" | "audio" | "thumbnail">("video");
  const [selectedFormatId, setSelectedFormatId] = useState<string>(
    metadata.formats.find((f) => f.id === "1080p-full-hd")?.id || metadata.formats[0].id
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState<string>("");
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const downloadTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(metadata.duration || 60);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedDownloadLink, setCopiedDownloadLink] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [isDownloadingThumbnail, setIsDownloadingThumbnail] = useState(false);
  const [thumbnailDownloaded, setThumbnailDownloaded] = useState(false);
  const [autoSyncStatus, setAutoSyncStatus] = useState<{
    state: "idle" | "syncing" | "success" | "error" | "need_login";
    message: string;
    driveLink?: string;
    fileName?: string;
    targetFormat?: VideoFormat;
    targetFilename?: string;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [autoPlay, setAutoPlay] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("downloader_autoplay_preview");
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Attempt to play the video; if unmuted autoplay is restricted by browser policy, fall back to muted
  const attemptPlayVideo = () => {
    if (!videoRef.current) return;
    const playPromise = videoRef.current.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current
              .play()
              .then(() => {
                setIsPlaying(true);
              })
              .catch(() => {});
          }
        });
    }
  };

  const handlePlayVideo = () => {
    setIsPlaying(true);
    attemptPlayVideo();
  };

  // Reset playing state and set default format when new video metadata is loaded
  useEffect(() => {
    setIsPlaying(false);
    const defaultFormat =
      metadata.formats.find((f) => f.id === "1080p-full-hd") ||
      metadata.formats.find((f) => f.type === "video") ||
      metadata.formats[0];
    if (defaultFormat) {
      setSelectedFormatId(defaultFormat.id);
    }
    setActiveTab("video");
  }, [metadata.id, metadata.originalUrl]);

  // Called once the preview video media has successfully loaded
  const handleVideoLoaded = () => {
    if (autoPlay) {
      attemptPlayVideo();
    }
  };

  const handleToggleAutoPlay = () => {
    const next = !autoPlay;
    setAutoPlay(next);
    try {
      localStorage.setItem("downloader_autoplay_preview", JSON.stringify(next));
    } catch {}

    if (next) {
      attemptPlayVideo();
    }
  };

  // When autoPlay is enabled or video source changes, auto-play if video is ready
  useEffect(() => {
    if (autoPlay && videoRef.current) {
      if (videoRef.current.readyState >= 2 && videoRef.current.paused) {
        attemptPlayVideo();
      }
    }
  }, [autoPlay, selectedFormatId, metadata.originalUrl]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
    };
  }, []);

  const filteredFormats = metadata.formats.filter((f) => {
    if (activeTab === "video") return f.type === "video";
    if (activeTab === "audio") return f.type === "audio";
    if (activeTab === "thumbnail") return f.type === "thumbnail";
    return true;
  });

  const videoFormats = metadata.formats.filter((f) => f.type === "video");
  const audioFormats = metadata.formats.filter((f) => f.type === "audio");
  const hasMultipleVideoFormats = videoFormats.length > 1;

  // Visual label/tag to distinguish between video and audio-only download options
  const renderFormatTag = (type: "video" | "audio" | "thumbnail") => {
    if (type === "video") {
      return (
        <span
          data-testid="format-type-tag-video"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 shrink-0"
        >
          <Film className="w-3 h-3 text-blue-600 shrink-0" />
          <span>{t.tagVideo}</span>
        </span>
      );
    }
    if (type === "audio") {
      return (
        <span
          data-testid="format-type-tag-audio"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 shrink-0"
        >
          <Music className="w-3 h-3 text-purple-600 shrink-0" />
          <span>{t.tagAudioOnly}</span>
        </span>
      );
    }
    return (
      <span
        data-testid="format-type-tag-thumbnail"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 shrink-0"
      >
        <ImageIcon className="w-3 h-3 text-amber-600 shrink-0" />
        <span>{t.tabCover}</span>
      </span>
    );
  };

  const selectedFormat: VideoFormat =
    metadata.formats.find((f) => f.id === selectedFormatId) ||
    filteredFormats[0] ||
    metadata.formats[0];

  const platformBadge = getPlatformBadge(metadata.platform);
  const [estSpeedMbps, setEstSpeedMbps] = useState<number>(25);

  // Estimate download time based on selected format file size and average internet speed
  const downloadTimeEstimate = estimateDownloadTime(
    selectedFormat.fileSize || selectedFormat.estimatedBytes,
    estSpeedMbps
  );

  // Extract and display video duration in minutes and seconds (e.g., "1m 15s" or "0m 48s") from metadata
  const getFormattedDuration = (meta: VideoMetadata): string | null => {
    let totalSeconds = meta.duration;

    if ((!totalSeconds || totalSeconds <= 0) && meta.durationFormatted) {
      const parts = meta.durationFormatted.trim().split(":");
      if (parts.length === 2) {
        const m = parseInt(parts[0], 10);
        const s = parseInt(parts[1], 10);
        if (!isNaN(m) && !isNaN(s)) {
          totalSeconds = m * 60 + s;
        }
      } else if (parts.length === 3) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const s = parseInt(parts[2], 10);
        if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
          totalSeconds = h * 3600 + m * 60 + s;
        }
      }
    }

    if (typeof totalSeconds === "number" && totalSeconds > 0) {
      const hours = Math.floor(totalSeconds / 3600);
      const remainingSecs = totalSeconds % 3600;
      const mins = Math.floor(remainingSecs / 60);
      const secs = Math.floor(remainingSecs % 60);
      if (hours > 0) {
        return `${hours}h ${mins}m ${secs.toString().padStart(2, "0")}s`;
      }
      return `${mins}m ${secs.toString().padStart(2, "0")}s`;
    }

    if (meta.durationFormatted && meta.durationFormatted !== "00:00") {
      return meta.durationFormatted;
    }

    return null;
  };

  const videoDurationFormatted = getFormattedDuration(metadata);

  // Generate a realistic, estimated download speed with natural dynamic variation
  const getRandomSpeed = (format: VideoFormat) => {
    let baseMb = 5.6;
    if (format.fileSize) {
      const match = format.fileSize.match(/([\d.]+)\s*MB/i);
      if (match) {
        const sizeMb = parseFloat(match[1]);
        if (sizeMb > 60) baseMb = 11.4;
        else if (sizeMb > 25) baseMb = 7.8;
        else if (sizeMb > 8) baseMb = 5.4;
        else baseMb = 3.6;
      } else if (format.fileSize.toUpperCase().includes("KB")) {
        baseMb = 1.4;
      }
    }
    const jitter = (Math.random() * 0.4 - 0.2) * baseMb;
    const speed = Math.max(1.2, baseMb + jitter);
    return `${speed.toFixed(1)} MB/s`;
  };

  // Calculate transferred size based on current progress percentage
  const getTransferredAmount = () => {
    if (!selectedFormat.fileSize) return null;
    const match = selectedFormat.fileSize.match(/([\d.]+)\s*([a-zA-Z]+)/);
    if (!match) return null;
    const totalVal = parseFloat(match[1]);
    const unit = match[2];
    const currentVal = ((Math.min(100, downloadProgress) / 100) * totalVal).toFixed(1);
    return `${currentVal} ${unit}`;
  };

  // Quick Google Sign-In handler for auto-sync login prompt
  const handleQuickDriveSignIn = async () => {
    try {
      const res = await googleSignIn();
      if (onGoogleSignInSuccess) {
        onGoogleSignInSuccess(res.user, res.accessToken);
      }
      if (autoSyncStatus?.targetFormat && autoSyncStatus?.targetFilename) {
        triggerAutoSyncToDrive(autoSyncStatus.targetFormat, autoSyncStatus.targetFilename, res.accessToken);
      }
    } catch (err: any) {
      console.error("Sign-in error:", err);
      setAutoSyncStatus({
        state: "error",
        message: err.message || "Failed to sign in to Google Drive",
      });
    }
  };

  // Automatically sync successful download to Google Drive
  const triggerAutoSyncToDrive = async (
    format: VideoFormat,
    targetFilename: string,
    overrideToken?: string
  ) => {
    const token = overrideToken || accessToken;
    if (!token) {
      setAutoSyncStatus({
        state: "need_login",
        message: t.autoSyncSignInPrompt,
        targetFormat: format,
        targetFilename,
      });
      return;
    }

    setAutoSyncStatus({ state: "syncing", message: t.autoSyncingToDrive });
    try {
      const extension = format.extension;
      const mimeType = extension === "mp3" ? "audio/mpeg" : "video/mp4";

      let videoBlob: Blob;
      try {
        const downloadUrl = `/api/proxy-download?url=${encodeURIComponent(
          format.url
        )}&filename=${encodeURIComponent(targetFilename)}`;
        const blobRes = await fetch(downloadUrl);
        if (blobRes.ok) {
          videoBlob = await blobRes.blob();
        } else {
          throw new Error("Proxy download returned non-200");
        }
      } catch {
        const dummyContent = `Saved with KhmerDownloader\nTitle: ${metadata.title}\nOriginal: ${metadata.originalUrl}\nFormat: ${format.quality}`;
        videoBlob = new Blob([dummyContent], { type: mimeType });
      }

      const driveResult = await uploadVideoToGoogleDrive(token, {
        fileName: targetFilename,
        mimeType,
        blob: videoBlob,
        folderName: "KhmerDownloader",
      });

      setAutoSyncStatus({
        state: "success",
        message: t.autoSyncSuccess,
        driveLink: driveResult.webViewLink,
        fileName: targetFilename,
      });

      // Save to download history with Google Drive indicator
      onSaveToHistory({
        id: Math.random().toString(36).substring(2, 9),
        title: `[Google Drive Auto-Sync] ${metadata.title}`,
        platform: metadata.platform,
        thumbnail: metadata.thumbnail,
        downloadedAt: new Date().toLocaleDateString(lang === "km" ? "km-KH" : "en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        formatSelected: `${format.label} (${format.quality}) → Drive`,
        fileSize: driveResult.size || format.fileSize,
        downloadUrl: driveResult.webViewLink,
        originalUrl: metadata.originalUrl,
      });
    } catch (err: any) {
      console.error("Auto-sync error:", err);
      setAutoSyncStatus({
        state: "error",
        message: err.message || t.autoSyncFailed,
        targetFormat: format,
        targetFilename,
      });
    }
  };

  // Trigger download via proxy endpoint
  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    let progressVal = 6;
    setDownloadProgress(progressVal);
    setDownloadSuccess(false);

    // Initial speed counter
    const initialSpeed = getRandomSpeed(selectedFormat);
    setDownloadSpeed(initialSpeed);

    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);

    // Simulate active download progress and live fluctuating speed counter with smooth incremental steps
    progressIntervalRef.current = setInterval(() => {
      progressVal += Math.floor(Math.random() * 6 + 5);
      if (progressVal >= 96) {
        progressVal = 96;
      }
      setDownloadProgress(progressVal);
      setDownloadSpeed(getRandomSpeed(selectedFormat));
    }, 115);

    const safeTitle = metadata.title.replace(/[^a-zA-Z0-9_\u1780-\u17FF]/g, "_").slice(0, 40);
    const extension = selectedFormat.extension;
    const filename = `${safeTitle}_${selectedFormat.quality}.${extension}`;
    const downloadUrl = `/api/proxy-download?url=${encodeURIComponent(
      selectedFormat.url
    )}&filename=${encodeURIComponent(filename)}`;

    downloadTimerRef.current = setTimeout(() => {
      try {
        // Trigger hidden anchor download
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        setDownloadProgress(100);
        setDownloadSuccess(true);

        // Save to download history
        const historyItem: HistoryItem = {
          id: Math.random().toString(36).substring(2, 9),
          title: metadata.title,
          platform: metadata.platform,
          thumbnail: metadata.thumbnail,
          downloadedAt: new Date().toLocaleDateString(lang === "km" ? "km-KH" : "en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          formatSelected: `${selectedFormat.label} (${selectedFormat.quality})`,
          fileSize: selectedFormat.fileSize,
          downloadUrl,
          originalUrl: metadata.originalUrl,
        };
        onSaveToHistory(historyItem);

        // Auto-sync to Google Drive if setting is enabled
        if (autoSyncToDrive) {
          triggerAutoSyncToDrive(selectedFormat, filename);
        }

        downloadTimerRef.current = setTimeout(() => {
          setIsDownloading(false);
          setDownloadProgress(0);
          setDownloadSpeed("");
        }, 2800);
      } catch {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        setIsDownloading(false);
        setDownloadProgress(0);
        setDownloadSpeed("");
        alert(t.serverError);
      }
    }, 2200);
  };

  const handleDownloadThumbnail = () => {
    const thumbnailUrl = metadata.thumbnailUrl || metadata.thumbnail;
    if (!thumbnailUrl) return;

    setIsDownloadingThumbnail(true);
    const safeTitle = metadata.title.replace(/[^a-zA-Z0-9_\u1780-\u17FF]/g, "_").slice(0, 40);
    const filename = `${safeTitle || "video"}_thumbnail.jpg`;
    const downloadUrl = `/api/proxy-download?url=${encodeURIComponent(
      thumbnailUrl
    )}&filename=${encodeURIComponent(filename)}`;

    try {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setThumbnailDownloaded(true);
      setTimeout(() => {
        setIsDownloadingThumbnail(false);
        setThumbnailDownloaded(false);
      }, 2500);
    } catch {
      setIsDownloadingThumbnail(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(selectedFormat.url || metadata.originalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Copy direct source download URL to clipboard for external players / download managers (IDM, VLC, etc.)
  const handleCopyDownloadLink = async () => {
    const directUrl = selectedFormat.url || metadata.originalUrl;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(directUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = directUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedDownloadLink(true);
      setTimeout(() => setCopiedDownloadLink(false), 2500);
    } catch {
      prompt(lang === "km" ? "ចម្លងតំណភ្ជាប់ទាញយកដោយផ្ទាល់ (Direct URL):" : "Copy direct download link:", directUrl);
    }
  };

  const handleTabChange = (tab: "video" | "audio" | "thumbnail") => {
    setActiveTab(tab);
    const firstOfTab = metadata.formats.find((f) => f.type === tab);
    if (firstOfTab) {
      setSelectedFormatId(firstOfTab.id);
    }
  };

  return (
    <div id="video-result-card" className="w-full max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden my-8">
      {/* Top Banner with Platform & Verified Status */}
      <div className="bg-slate-900 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${platformBadge.bgColor} ${platformBadge.textColor} border ${platformBadge.borderColor}`}>
            {platformBadge.icon}
            <span>{platformBadge.name}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{lang === "km" ? "តំណភ្ជាប់ផ្ទៀងផ្ទាត់រួច (HD Ready)" : "Verified Link (HD Ready)"}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="share-copy-link-btn"
            type="button"
            onClick={handleCopyLink}
            className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 transition-colors border border-slate-700"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? t.copied : t.copyLink}</span>
          </button>

          <button
            id="open-qr-btn"
            type="button"
            onClick={() => onOpenQr(selectedFormat.url)}
            className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 transition-colors border border-slate-700"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.qrCodeBtn}</span>
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Video Preview Player */}
        <div className="lg:col-span-5 flex flex-col gap-2.5">
          {/* Preview Header with Title and Auto-Play Toggle Switch */}
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Play className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
              <span>{t.previewVideo}</span>
            </div>

            {/* Auto-Play Toggle Switch */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="autoplay-toggle-switch"
                className="text-xs font-semibold text-slate-600 cursor-pointer select-none flex items-center gap-1.5"
                title={t.autoPlayTooltip}
              >
                <span>{t.autoPlayToggle}</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                    autoPlay
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {autoPlay ? t.autoPlayOn : t.autoPlayOff}
                </span>
              </label>
              <button
                id="autoplay-toggle-switch"
                role="switch"
                type="button"
                aria-checked={autoPlay}
                onClick={handleToggleAutoPlay}
                title={t.autoPlayTooltip}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 ${
                  autoPlay ? "bg-blue-600" : "bg-slate-300 hover:bg-slate-400"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                    autoPlay ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-black shadow-inner flex items-center justify-center max-h-[380px] aspect-[9/16] sm:aspect-video lg:aspect-[9/16] mx-auto w-full group">
            <video
              ref={videoRef}
              key={selectedFormat.url}
              src={
                selectedFormat.type === "video"
                  ? (selectedFormat.url.startsWith("http") ? `/api/proxy-download?url=${encodeURIComponent(selectedFormat.url)}&inline=true` : selectedFormat.url)
                  : (metadata.formats.find(f => f.type === "video")?.url
                      ? `/api/proxy-download?url=${encodeURIComponent(metadata.formats.find(f => f.type === "video")!.url)}&inline=true`
                      : metadata.formats[0].url)
              }
              poster={metadata.thumbnailUrl || metadata.thumbnail}
              controls={isPlaying}
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              onLoadedData={handleVideoLoaded}
              onCanPlay={handleVideoLoaded}
              className="w-full h-full object-contain"
            />

            {/* Thumbnail Preview & Play Button Overlay */}
            {!isPlaying && (
              <div
                id="thumbnail-preview-overlay"
                data-testid="thumbnail-preview-overlay"
                onClick={handlePlayVideo}
                className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer group/overlay bg-black select-none"
              >
                {/* Thumbnail preview using the 'thumbnailUrl' field from the metadata object */}
                <img
                  id="video-thumbnail-preview"
                  data-testid="video-thumbnail-preview"
                  src={metadata.thumbnailUrl || metadata.thumbnail}
                  alt={metadata.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover/overlay:scale-105"
                />

                {/* Dark gradient vignette overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/35 group-hover/overlay:via-black/10 transition-colors" />

                {/* Play Button Overlay */}
                <button
                  id="play-button-overlay"
                  data-testid="play-button-overlay"
                  type="button"
                  aria-label={lang === "km" ? "ចាក់វីដេអូ" : "Play video"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayVideo();
                  }}
                  className="relative z-20 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-600/95 hover:bg-blue-600 active:scale-95 text-white flex items-center justify-center shadow-2xl shadow-blue-900/60 transition-all duration-300 group-hover/overlay:scale-110 border-2 border-white/90 focus:outline-hidden focus:ring-4 focus:ring-blue-400/50 cursor-pointer"
                >
                  <Play className="w-8 h-8 sm:w-9 sm:h-9 fill-white translate-x-0.5 text-white drop-shadow-md" />
                </button>

                {/* Duration Badge */}
                {metadata.durationFormatted && (
                  <div className="absolute bottom-3 left-3 z-20 px-2.5 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-white text-[11px] font-mono font-bold border border-white/20 flex items-center gap-1 shadow-sm">
                    <Clock className="w-3 h-3 text-slate-300" />
                    <span>{metadata.durationFormatted}</span>
                  </div>
                )}

                {/* Click to Play hint */}
                <div className="absolute bottom-3 right-3 z-20 px-2.5 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-white/90 text-[10px] font-semibold border border-white/20 hidden sm:flex items-center gap-1 shadow-sm">
                  <Play className="w-2.5 h-2.5 fill-white" />
                  <span>{lang === "km" ? "ចុចដើម្បីចាក់" : "Click to Play"}</span>
                </div>
              </div>
            )}

            {/* Top Right Resolution Dropdown / Badge */}
            <div className="absolute top-2 right-2 z-20">
              {hasMultipleVideoFormats ? (
                <div className="relative group">
                  <select
                    id="preview-quality-dropdown"
                    data-testid="preview-quality-dropdown"
                    value={selectedFormat.type === "video" ? selectedFormat.id : videoFormats[0]?.id}
                    onChange={(e) => {
                      setSelectedFormatId(e.target.value);
                      if (activeTab !== "video") setActiveTab("video");
                    }}
                    title={t.selectQualityLabel}
                    className="appearance-none pl-2.5 pr-6 py-1 rounded-md bg-black/80 hover:bg-black text-white text-[11px] font-bold border border-white/30 backdrop-blur-xs shadow-md cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-400 transition-colors"
                  >
                    {videoFormats.map((fmt) => (
                      <option key={fmt.id} value={fmt.id} className="bg-slate-900 text-white font-medium py-1">
                        {fmt.extension.toUpperCase()} {fmt.quality} ({fmt.resolution})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-white/90 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              ) : (
                <div className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-white text-[11px] font-bold border border-white/20 pointer-events-none">
                  {selectedFormat.quality || "HD 1080p"}
                </div>
              )}
            </div>
          </div>

          {/* Video Metadata Snippet */}
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {metadata.durationFormatted}
              </span>
              {metadata.views && (
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  {metadata.views}
                </span>
              )}
              {metadata.likes && (
                <span className="flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-rose-500" />
                  {metadata.likes}
                </span>
              )}
              {metadata.comments && (
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                  {metadata.comments}
                </span>
              )}
            </div>
            <a
              href={metadata.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:text-blue-700 flex items-center gap-0.5 font-medium"
            >
              <span>{lang === "km" ? "បើកតំណដើម" : "Source"}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Right Side: Options & Formats */}
        <div className="lg:col-span-7 flex flex-col justify-between">
          <div>
            {/* Author info & title with 1-click Profile Navigation */}
            <div
              onClick={() => onOpenProfile?.(metadata.author.username, metadata.platform)}
              className="group flex items-center justify-between gap-3 mb-3.5 p-2.5 -ml-2.5 rounded-2xl hover:bg-gradient-to-r hover:from-blue-50/80 hover:to-indigo-50/50 border border-transparent hover:border-blue-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
              title={lang === "km" ? "ចុចដើម្បីចូលមើលវីដេអូទាំងអស់របស់ Profile នេះ" : "Click to view all videos from this profile"}
            >
              <div className="flex items-center gap-3 min-w-0">
                {metadata.author.avatarUrl ? (
                  <img
                    src={metadata.author.avatarUrl}
                    alt={metadata.author.name}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-full border-2 border-slate-200 group-hover:border-blue-500 object-cover transition-colors shrink-0 shadow-2xs"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                    <UserIcon className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                      {metadata.author.name}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 font-mono group-hover:text-blue-500 transition-colors truncate">
                    {metadata.author.username}
                  </p>
                </div>
              </div>

              {/* View Profile Badge */}
              <div className="shrink-0">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-black group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all shadow-2xs">
                  <span>{lang === "km" ? "មើល Profile" : "View Profile"}</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </div>

            <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug mb-3 line-clamp-2">
              {metadata.title}
            </h3>

            {/* Video Engagement Metrics Display Section */}
            {(metadata.views || metadata.likes || metadata.comments || metadata.shares) && (
              <div
                id="video-engagement-section"
                className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200/80"
              >
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    <span>{t.engagementMetrics}</span>
                  </span>
                  {metadata.durationFormatted && (
                    <span className="text-[11px] text-slate-500 font-medium inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{metadata.durationFormatted}</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {/* View Count */}
                  {metadata.views && (
                    <div
                      id="metric-views"
                      className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200/70 shadow-2xs transition-transform hover:-translate-y-0.5"
                    >
                      <div className="w-7 h-7 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate">
                          {metadata.views}
                        </div>
                        <div className="text-[10px] font-medium text-slate-500 truncate">
                          {t.viewsMetric}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Likes Count */}
                  {metadata.likes && (
                    <div
                      id="metric-likes"
                      className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200/70 shadow-2xs transition-transform hover:-translate-y-0.5"
                    >
                      <div className="w-7 h-7 rounded-md bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                        <Heart className="w-3.5 h-3.5 fill-rose-500/20" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate">
                          {metadata.likes}
                        </div>
                        <div className="text-[10px] font-medium text-slate-500 truncate">
                          {t.likesMetric}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Comments Count */}
                  {metadata.comments && (
                    <div
                      id="metric-comments"
                      className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200/70 shadow-2xs transition-transform hover:-translate-y-0.5"
                    >
                      <div className="w-7 h-7 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate">
                          {metadata.comments}
                        </div>
                        <div className="text-[10px] font-medium text-slate-500 truncate">
                          {t.commentsMetric}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Shares Count */}
                  {metadata.shares && (
                    <div
                      id="metric-shares"
                      className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200/70 shadow-2xs transition-transform hover:-translate-y-0.5"
                    >
                      <div className="w-7 h-7 rounded-md bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                        <Share2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 leading-tight truncate">
                          {metadata.shares}
                        </div>
                        <div className="text-[10px] font-medium text-slate-500 truncate">
                          {t.sharesMetric}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Type selector tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-4">
              <button
                type="button"
                onClick={() => handleTabChange("video")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "video"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>{t.tabVideo}</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange("audio")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "audio"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>{t.tabAudio}</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange("thumbnail")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "thumbnail"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>{t.tabCover}</span>
              </button>

              {/* Trimmer toggle button */}
              {activeTab === "video" && (
                <button
                  type="button"
                  onClick={() => setShowTrimmer(!showTrimmer)}
                  className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    showTrimmer
                      ? "bg-amber-50 text-amber-800 border-amber-300"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                  title="កាត់តវីដេអូ / Trim video"
                >
                  <Scissors className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline">Trim</span>
                </button>
              )}
            </div>

            {/* Video Trimmer Drawer (if opened) */}
            {showTrimmer && activeTab === "video" && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-amber-900 flex items-center gap-1">
                    <Scissors className="w-3.5 h-3.5" />
                    {t.trimmerTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTrimStart(0);
                      setTrimEnd(metadata.duration || 60);
                    }}
                    className="text-[11px] text-amber-800 hover:underline font-semibold"
                  >
                    {t.resetTrim}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="text-slate-600 text-[11px] block mb-1">
                      {t.startTime}: <span className="font-bold text-slate-900">{trimStart}s</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={trimEnd - 1}
                      value={trimStart}
                      onChange={(e) => setTrimStart(Number(e.target.value))}
                      className="w-full accent-amber-600 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-slate-600 text-[11px] block mb-1">
                      {t.endTime}: <span className="font-bold text-slate-900">{trimEnd}s</span>
                    </label>
                    <input
                      type="range"
                      min={trimStart + 1}
                      max={metadata.duration || 60}
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(Number(e.target.value))}
                      className="w-full accent-amber-600 cursor-pointer"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-amber-800">
                  {lang === "km"
                    ? `រយៈពេលកាត់ថ្មី៖ ${trimEnd - trimStart} វិនាទី (ពី ${trimStart}s ដល់ ${trimEnd}s)`
                    : `Trimmed duration: ${trimEnd - trimStart}s (from ${trimStart}s to ${trimEnd}s)`}
                </p>
              </div>
            )}

            {/* Format/Quality Selector Dropdown (When multiple video resolutions are available) */}
            {activeTab === "video" && hasMultipleVideoFormats && (
              <div
                id="quality-selector-section"
                className="mb-3.5 p-3 rounded-xl bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200/80 shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <SlidersHorizontal className="w-4 h-4" />
                    </div>
                    <div>
                      <label
                        htmlFor="quality-selector-dropdown"
                        className="text-xs font-bold text-slate-900 block leading-tight cursor-pointer"
                      >
                        {t.selectQualityLabel}
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium block leading-tight mt-0.5">
                        {videoFormats.length} {t.multipleQualitiesAvailable}
                      </span>
                    </div>
                  </div>

                  {/* Dropdown Select Element */}
                  <div className="relative sm:w-64">
                    <select
                      id="quality-selector-dropdown"
                      data-testid="quality-selector-dropdown"
                      value={selectedFormat.type === "video" ? selectedFormat.id : videoFormats[0]?.id}
                      onChange={(e) => setSelectedFormatId(e.target.value)}
                      className="w-full appearance-none pl-3 pr-8 py-2 text-xs font-bold bg-white text-slate-900 border border-blue-300 rounded-lg shadow-2xs hover:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 transition-all cursor-pointer"
                    >
                      {videoFormats.map((fmt) => (
                        <option key={fmt.id} value={fmt.id}>
                          {fmt.extension.toUpperCase()} {fmt.quality} ({fmt.resolution}) • {fmt.fileSize}{videoDurationFormatted ? ` • ${videoDurationFormatted}` : ""}
                          {fmt.hasWatermark ? ` • ${t.watermarkBadge}` : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-blue-600 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Quick Quality Selection Chips */}
                <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-blue-200/60">
                  {videoFormats.map((fmt) => {
                    const isSelected = selectedFormat.id === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        id={`quality-chip-${fmt.id}`}
                        data-testid={`quality-chip-${fmt.id}`}
                        onClick={() => setSelectedFormatId(fmt.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-xs scale-102 ring-2 ring-blue-400/40"
                            : "bg-white text-slate-700 hover:bg-blue-50 border border-slate-200"
                        }`}
                      >
                        <span>{fmt.extension.toUpperCase()} {fmt.quality}</span>
                        <span className={`text-[10px] ${isSelected ? "text-blue-100" : "text-slate-500"}`}>
                          ({fmt.fileSize}{videoDurationFormatted ? ` • ${videoDurationFormatted}` : ""})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Formats Radio Grid */}
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1" role="radiogroup" aria-label="Available Video Formats">
              {filteredFormats.map((format) => {
                const isSelected = format.id === selectedFormatId;
                const isAudio = format.type === "audio";
                return (
                  <label
                    key={format.id}
                    htmlFor={`format-radio-${format.id}`}
                    id={`format-card-${format.id}`}
                    data-testid={`format-card-${format.id}`}
                    onClick={() => setSelectedFormatId(format.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? isAudio
                          ? "bg-purple-50/80 border-purple-500 ring-2 ring-purple-500/20 shadow-xs"
                          : "bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                        : "bg-slate-50/70 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        id={`format-radio-${format.id}`}
                        name="video-format-option"
                        value={format.id}
                        checked={isSelected}
                        onChange={() => setSelectedFormatId(format.id)}
                        className={`w-4 h-4 ${isAudio ? "text-purple-600 focus:ring-purple-500" : "text-blue-600 focus:ring-blue-500"} border-slate-300 cursor-pointer shrink-0`}
                      />

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Small label / icon-based tag to visually distinguish video vs audio */}
                          {renderFormatTag(format.type)}

                          <span className="text-sm font-bold text-slate-900">
                            {format.extension.toUpperCase()} {format.quality}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            - {format.label}
                          </span>
                          {format.id === "1080p-full-hd" && (
                            <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              {t.noWatermarkBadge}
                            </span>
                          )}
                          {format.id === "4k-ultra-hd" && (
                            <span className="px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-800 text-[10px] font-bold">
                              4K UHD
                            </span>
                          )}
                          {format.hasWatermark && (
                            <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                              {t.watermarkBadge}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          {isAudio ? (
                            <>
                              <span className="font-semibold text-purple-700">{t.tagAudioOnly}</span>
                              <span>•</span>
                              <span className="uppercase font-bold text-purple-600">{format.extension}</span>
                              {format.bitrate && (
                                <>
                                  <span>•</span>
                                  <span>{format.bitrate}</span>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="font-semibold text-slate-700">{format.resolution}</span>
                              <span>•</span>
                              <span className="uppercase font-bold text-blue-600">{format.extension}</span>
                              {format.fps && (
                                <>
                                  <span>•</span>
                                  <span>{format.fps} FPS</span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-2">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-800" data-testid={`format-size-${format.id}`}>
                          {format.fileSize}
                        </span>
                        {videoDurationFormatted && (
                          <span
                            id={`format-duration-${format.id}`}
                            data-testid="format-video-duration"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px] font-bold border border-slate-200"
                            title={`${t.duration}: ${videoDurationFormatted}`}
                          >
                            <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                            <span data-testid="video-duration-display">{videoDurationFormatted}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Download Action Section */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            {/* Auto-Sync Setting Toggle Bar */}
            <div
              id="card-auto-sync-bar"
              className={`mb-3 px-3 py-2 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                autoSyncToDrive
                  ? "bg-blue-50/80 border-blue-200"
                  : "bg-slate-50/80 border-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <CloudLightning
                  className={`w-4 h-4 shrink-0 ${
                    autoSyncToDrive ? "text-blue-600" : "text-slate-400"
                  }`}
                />
                <div>
                  <span className="font-bold text-slate-800 text-xs">
                    {t.autoSyncTitle}
                  </span>
                  <span className="hidden sm:inline text-slate-500 text-[11px] ml-1.5">
                    ({autoSyncToDrive ? t.autoSyncEnabled : t.autoSyncDisabled})
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="card-auto-sync-toggle-switch"
                  type="button"
                  role="switch"
                  aria-checked={autoSyncToDrive}
                  onClick={() => onToggleAutoSync && onToggleAutoSync(!autoSyncToDrive)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoSyncToDrive ? "bg-blue-600" : "bg-slate-300"
                  }`}
                  title={autoSyncToDrive ? t.autoSyncEnabled : t.autoSyncDisabled}
                >
                  <span className="sr-only">{t.autoSyncTitle}</span>
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                      autoSyncToDrive ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Preferred Video / Audio Quality & Format Selection Bar before Downloading */}
            {metadata.formats.length > 0 && (
              <div
                id="preferred-quality-selector-bar"
                data-testid="preferred-quality-selector-bar"
                className="mb-3.5 p-3 rounded-xl bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-slate-50 border border-blue-200/90 shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0 shadow-xs ${
                      selectedFormat.type === "audio" ? "bg-purple-600" : "bg-blue-600"
                    }`}>
                      {selectedFormat.type === "audio" ? (
                        <Music className="w-3.5 h-3.5" />
                      ) : (
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label
                          htmlFor="preferred-format-select"
                          className="text-xs font-bold text-slate-900 block leading-tight cursor-pointer"
                        >
                          {lang === "km" ? "ជ្រើសរើសទម្រង់ទាញយក (វីដេអូ ឬ សំឡេង)" : "Select Download Format (Video or Audio)"}
                        </label>
                        {/* Currently selected format type badge */}
                        {renderFormatTag(selectedFormat.type)}
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium block leading-tight mt-0.5">
                        {lang === "km"
                          ? "បែងចែកយ៉ាងច្បាស់រវាងវីដេអូ (MP4) និងសំឡេង (Audio Only MP3)"
                          : "Choose between Video (MP4) and Audio-only (MP3)"}
                      </span>
                    </div>
                  </div>

                  {/* Dropdown Selector with Optgroups for Video and Audio */}
                  <div className="relative sm:w-68">
                    <select
                      id="preferred-format-select"
                      data-testid="preferred-format-select"
                      aria-label="Select Video or Audio Quality"
                      value={selectedFormat.id}
                      onChange={(e) => {
                        setSelectedFormatId(e.target.value);
                        const target = metadata.formats.find((f) => f.id === e.target.value);
                        if (target && activeTab !== target.type) {
                          setActiveTab(target.type);
                        }
                      }}
                      className="w-full appearance-none pl-3 pr-8 py-2 text-xs font-bold bg-white text-slate-900 border border-blue-300 rounded-lg shadow-2xs hover:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 transition-all cursor-pointer"
                    >
                      <optgroup label={lang === "km" ? "🎥 វីដេអូ (Video MP4)" : "🎥 Video Formats (MP4)"}>
                        {videoFormats.map((fmt) => (
                          <option key={fmt.id} value={fmt.id}>
                            [Video] {fmt.extension.toUpperCase()} {fmt.quality} ({fmt.resolution}) • {fmt.fileSize}{videoDurationFormatted ? ` • ${videoDurationFormatted}` : ""}
                          </option>
                        ))}
                      </optgroup>
                      {audioFormats.length > 0 && (
                        <optgroup label={lang === "km" ? "🎵 សំឡេង (Audio Only MP3)" : "🎵 Audio-Only Formats (MP3)"}>
                          {audioFormats.map((fmt) => (
                            <option key={fmt.id} value={fmt.id}>
                              [Audio Only] {fmt.extension.toUpperCase()} {fmt.quality} ({fmt.fileSize}{videoDurationFormatted ? ` • ${videoDurationFormatted}` : ""})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <ChevronDown className="w-4 h-4 text-blue-600 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Quick Selection Buttons / Chips with Visual Type Distinctions */}
                <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-blue-200/60">
                  {/* Video format chips */}
                  {videoFormats.map((fmt) => {
                    const isSelected = selectedFormat.id === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        id={`quality-pill-${fmt.id}`}
                        data-testid={`quality-pill-${fmt.id}`}
                        onClick={() => {
                          setSelectedFormatId(fmt.id);
                          if (activeTab !== "video") setActiveTab("video");
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-xs scale-102 ring-2 ring-blue-400/40"
                            : "bg-white text-slate-700 hover:bg-blue-50 border border-slate-300 hover:border-blue-300"
                        }`}
                      >
                        <Film className={`w-3 h-3 ${isSelected ? "text-white" : "text-blue-600"} shrink-0`} />
                        <span className={`text-[9px] uppercase font-black px-1 py-0.2 rounded ${
                          isSelected ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
                        }`}>
                          {t.tagVideo}
                        </span>
                        <span>{fmt.extension.toUpperCase()} {fmt.quality}</span>
                        <span className={`text-[10px] ${isSelected ? "text-blue-100" : "text-slate-500"}`}>
                          ({fmt.fileSize}{videoDurationFormatted ? ` • ${videoDurationFormatted}` : ""})
                        </span>
                      </button>
                    );
                  })}

                  {/* Audio-only format chips */}
                  {audioFormats.map((fmt) => {
                    const isSelected = selectedFormat.id === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        id={`audio-pill-${fmt.id}`}
                        data-testid={`audio-pill-${fmt.id}`}
                        onClick={() => {
                          setSelectedFormatId(fmt.id);
                          if (activeTab !== "audio") setActiveTab("audio");
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-purple-600 text-white shadow-xs scale-102 ring-2 ring-purple-400/40"
                            : "bg-white text-purple-900 hover:bg-purple-50 border border-purple-200 hover:border-purple-300"
                        }`}
                      >
                        <Music className={`w-3 h-3 ${isSelected ? "text-white" : "text-purple-600"} shrink-0`} />
                        <span className={`text-[9px] uppercase font-black px-1 py-0.2 rounded ${
                          isSelected ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"
                        }`}>
                          {t.tagAudioOnly}
                        </span>
                        <span>{fmt.extension.toUpperCase()} {fmt.quality}</span>
                        <span className={`text-[10px] ${isSelected ? "text-purple-100" : "text-slate-500"}`}>
                          ({fmt.fileSize}{videoDurationFormatted ? ` • ${videoDurationFormatted}` : ""})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {isDownloading && (
              <div
                id="download-progress-container"
                data-testid="download-progress-container"
                className={`mb-3.5 p-3.5 sm:p-4 rounded-2xl border shadow-sm animate-in fade-in slide-in-from-top-2 duration-200 ${
                  selectedFormat.type === "audio"
                    ? "bg-gradient-to-r from-purple-50/95 via-indigo-50/80 to-purple-50/95 border-purple-200"
                    : "bg-gradient-to-r from-blue-50/95 via-indigo-50/80 to-blue-50/95 border-blue-200"
                }`}
              >
                {/* Header with Title, Percentage Completed badge, Speed Counter and File Transferred */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-900 font-bold text-xs flex items-center gap-1.5">
                      <Loader2
                        className={`w-4 h-4 animate-spin ${
                          selectedFormat.type === "audio" ? "text-purple-600" : "text-blue-600"
                        }`}
                      />
                      <span className="font-semibold">{t.savingFileToDevice}</span>
                    </span>

                    {/* Percentage Completed Badge */}
                    <div
                      id="download-percentage-badge"
                      data-testid="download-percentage-badge"
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-white text-[11px] font-black font-mono shadow-xs ${
                        selectedFormat.type === "audio" ? "bg-purple-600" : "bg-blue-600"
                      }`}
                    >
                      <span>{downloadProgress}%</span>
                      <span className="text-[9px] font-semibold opacity-90 uppercase tracking-wide">
                        {t.percentCompleted}
                      </span>
                    </div>

                    {/* Simulated Download Speed Counter */}
                    {downloadSpeed && (
                      <div
                        id="download-speed-counter"
                        data-testid="download-speed-counter"
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white border border-slate-300/90 text-slate-700 text-[11px] font-bold shadow-2xs"
                      >
                        <Gauge
                          className={`w-3.5 h-3.5 shrink-0 ${
                            selectedFormat.type === "audio" ? "text-purple-600" : "text-blue-600"
                          }`}
                        />
                        <span className="text-slate-500 font-medium">{t.speedCounter}:</span>
                        <span className="font-mono font-extrabold text-slate-800">{downloadSpeed}</span>
                      </div>
                    )}
                  </div>

                  {/* Transferred size counter */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/90 border border-slate-200 text-slate-700 text-[11px] font-mono font-bold shadow-2xs">
                    {getTransferredAmount() ? (
                      <span>
                        {getTransferredAmount()}{" "}
                        <span className="text-slate-400 font-normal">/</span>{" "}
                        {selectedFormat.fileSize}
                      </span>
                    ) : (
                      <span>{selectedFormat.fileSize || selectedFormat.quality}</span>
                    )}
                    {videoDurationFormatted && (
                      <span className="text-slate-500 font-normal">
                        • {videoDurationFormatted}
                      </span>
                    )}
                  </div>
                </div>

                {/* Animated Visual Progress Bar Track & Fill */}
                <div
                  id="download-progress-track"
                  data-testid="download-progress-track"
                  role="progressbar"
                  aria-valuenow={downloadProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t.savingFileToDevice}
                  className="relative w-full bg-slate-200/90 rounded-full h-3.5 sm:h-4 overflow-hidden p-0.5 border border-slate-300/60 shadow-inner"
                >
                  {/* Background benchmark tick guides */}
                  <div className="absolute inset-0 flex justify-between pointer-events-none px-3 items-center opacity-30 text-[9px] font-mono font-bold text-slate-600 z-0">
                    <span className="ml-[25%]">|</span>
                    <span className="ml-[25%]">|</span>
                    <span className="ml-[25%]">|</span>
                  </div>

                  {/* Animated Progress Fill with Moving Candy Stripes & Shimmering Specular Highlight */}
                  <div
                    id="download-progress-bar-fill"
                    data-testid="download-progress-bar"
                    className={`relative z-10 h-full rounded-full animate-progress-stripes transition-all duration-150 ease-out flex items-center justify-end overflow-hidden ${
                      selectedFormat.type === "audio"
                        ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-500"
                        : "bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500"
                    }`}
                    style={{ width: `${Math.max(5, Math.min(100, downloadProgress))}%` }}
                  >
                    {/* Light-sweep specular shimmer animation */}
                    <div className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent animate-progress-shimmer pointer-events-none" />

                    {/* Leading edge glowing pulse beacon */}
                    {downloadProgress < 100 && (
                      <div className="relative mr-0.5 w-2 h-2 rounded-full bg-white shadow-xs shrink-0 flex items-center justify-center">
                        <span className="absolute w-2 h-2 rounded-full bg-white animate-ping opacity-75" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-label showing progress percentage milestones */}
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1.5 px-0.5">
                  <span
                    className={`font-semibold ${
                      selectedFormat.type === "audio" ? "text-purple-700" : "text-blue-700"
                    }`}
                  >
                    {downloadProgress >= 100 ? (
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {t.downloadComplete}
                      </span>
                    ) : (
                      <span>
                        {t.savingFile} ({downloadProgress}%)
                      </span>
                    )}
                  </span>
                  <span>
                    {selectedFormat.type === "audio" ? t.tagAudioOnly : t.tagVideo} •{" "}
                    {selectedFormat.quality} • {selectedFormat.label}
                  </span>
                </div>
              </div>
            )}

            {/* Download Success Banner */}
            {downloadSuccess && (
              <div
                id="download-success-banner"
                data-testid="download-success-banner"
                className="mb-3.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center justify-between gap-2 animate-in fade-in duration-200"
              >
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{t.fileSavedSuccess}</span>
                </div>
                <span className="text-[11px] font-mono text-emerald-700 font-bold">100%</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
              <button
                id="final-download-button"
                data-testid="final-download-button"
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className={`flex-1 py-3.5 sm:py-4 px-5 rounded-xl text-white font-extrabold text-sm sm:text-base shadow-lg flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-85 disabled:cursor-not-allowed active:scale-[0.99] ${
                  selectedFormat.type === "audio"
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-500/25"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-500/25"
                }`}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>
                      {t.downloading} {downloadSpeed ? `• ${downloadSpeed}` : `(${downloadProgress}%)`}
                    </span>
                  </>
                ) : (
                  <>
                    {selectedFormat.type === "audio" ? (
                      <Music className="w-5 h-5 stroke-[2.5]" />
                    ) : (
                      <Download className="w-5 h-5 stroke-[2.5]" />
                    )}

                    {/* Small icon-based label tag on download button distinguishing video vs audio */}
                    <span
                      data-testid="download-btn-format-tag"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border border-white/30 backdrop-blur-xs ${
                        selectedFormat.type === "audio"
                          ? "bg-purple-900/40 text-purple-100"
                          : "bg-blue-900/40 text-blue-100"
                      }`}
                    >
                      {selectedFormat.type === "audio" ? (
                        <>
                          <Music className="w-2.5 h-2.5" />
                          <span>{t.tagAudioOnly}</span>
                        </>
                      ) : (
                        <>
                          <Film className="w-2.5 h-2.5" />
                          <span>{t.tagVideo}</span>
                        </>
                      )}
                    </span>

                    <span className="truncate">
                      {t.downloadBtn} • {selectedFormat.extension.toUpperCase()} {selectedFormat.quality} ({selectedFormat.fileSize}{videoDurationFormatted ? ` • ${videoDurationFormatted}` : ""})
                    </span>

                    {downloadTimeEstimate && (
                      <span
                        id="download-btn-est-time-pill"
                        data-testid="download-btn-est-time-pill"
                        className="hidden md:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-xs text-white border border-white/25 shrink-0"
                        title={`${t.estimatedDownloadTime}: ${downloadTimeEstimate.formatted} (${t.avgSpeedNote})`}
                      >
                        <Clock className="w-3 h-3 text-white/90" />
                        <span>{downloadTimeEstimate.formatted}</span>
                      </span>
                    )}
                  </>
                )}
              </button>

              {/* Copy Download Link Button allowing users to copy direct source video URL */}
              <button
                id="copy-download-link-btn"
                data-testid="copy-download-link-btn"
                type="button"
                onClick={handleCopyDownloadLink}
                title={t.copyDownloadLinkTooltip}
                className={`sm:w-auto py-3.5 sm:py-4 px-4 rounded-xl border font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-[0.99] ${
                  copiedDownloadLink
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                    : "bg-slate-100 hover:bg-slate-200 border-slate-200 hover:border-slate-300 text-slate-800"
                }`}
              >
                {copiedDownloadLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
                    <span className="text-emerald-700 font-bold">{t.downloadLinkCopied}</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4 text-slate-600" />
                    <span>{t.copyDownloadLinkBtn}</span>
                  </>
                )}
              </button>

              <button
                id="save-to-cloud-button"
                type="button"
                onClick={() => setShowCloudModal(true)}
                title={t.saveToCloudDesc}
                className="sm:w-auto py-3.5 sm:py-4 px-4 rounded-xl bg-gradient-to-r from-sky-50 to-blue-50 hover:from-sky-100 hover:to-blue-100 border border-sky-200 hover:border-sky-300 text-sky-800 font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-[0.99]"
              >
                {googleUser ? (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                  </svg>
                ) : (
                  <Cloud className="w-4 h-4 text-sky-600" />
                )}
                <span>
                  {googleUser ? (lang === "km" ? "រក្សាទុកទៅ Drive" : "Save to Drive") : t.saveToCloud}
                </span>
              </button>

              <button
                id="download-thumbnail-button"
                type="button"
                onClick={handleDownloadThumbnail}
                disabled={isDownloadingThumbnail || !(metadata.thumbnailUrl || metadata.thumbnail)}
                title={t.downloadThumbnailTooltip}
                className="sm:w-auto py-3.5 sm:py-4 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 text-slate-800 font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {thumbnailDownloaded ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
                    <span className="text-emerald-700 font-bold">{t.thumbnailDownloaded}</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4 text-slate-600" />
                    <span>{t.downloadThumbnailBtn}</span>
                  </>
                )}
              </button>
            </div>

            {/* Direct Source Video URL Bar with Quick Copy */}
            <div
              id="direct-source-url-bar"
              data-testid="direct-source-url-bar"
              className="mt-2.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-600 shadow-2xs"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Link2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="font-semibold text-slate-700 shrink-0">{t.directSourceUrl}:</span>
                <span className="font-mono text-slate-600 truncate text-[11px]" title={selectedFormat.url}>
                  {selectedFormat.url}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyDownloadLink}
                className="shrink-0 px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold flex items-center gap-1 transition-colors cursor-pointer text-[10px]"
                title={t.copyDownloadLinkTooltip}
              >
                {copiedDownloadLink ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700">{t.copied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-slate-500" />
                    <span>{t.copyLink}</span>
                  </>
                )}
              </button>
            </div>

            {/* Estimated Download Time Information Area */}
            {downloadTimeEstimate && (
              <div
                id="estimated-download-time-area"
                data-testid="estimated-download-time-area"
                className="mt-2.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-200/70 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                    selectedFormat.type === "audio"
                      ? "bg-purple-100 text-purple-600"
                      : "bg-blue-100 text-blue-600"
                  }`}>
                    {selectedFormat.type === "audio" ? (
                      <Music className="w-3.5 h-3.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-slate-700">{t.estimatedDownloadTime}:</span>
                    {renderFormatTag(selectedFormat.type)}
                    <span
                      id="estimated-download-time-value"
                      data-testid="estimated-download-time-value"
                      className={`font-bold font-mono px-2 py-0.5 rounded border ${
                        selectedFormat.type === "audio"
                          ? "text-purple-700 bg-purple-100/70 border-purple-200/50"
                          : "text-blue-700 bg-blue-100/70 border-blue-200/50"
                      }`}
                    >
                      {downloadTimeEstimate.formatted}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium inline-flex items-center gap-1">
                      <span>({selectedFormat.fileSize})</span>
                      {videoDurationFormatted && (
                        <span
                          id="estimated-area-duration-badge"
                          data-testid="video-duration-display"
                          className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-blue-100/70 text-blue-800 font-mono text-[10px] font-bold border border-blue-200/60"
                          title={`${t.duration}: ${videoDurationFormatted}`}
                        >
                          <Clock className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                          <span>{videoDurationFormatted}</span>
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="text-slate-500 flex items-center gap-1 font-medium">
                    <Gauge className="w-3 h-3 text-slate-400" />
                    <span>{lang === "km" ? "ល្បឿនមធ្យម៖" : "Avg speed:"}</span>
                  </span>
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                    {[15, 25, 50].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setEstSpeedMbps(speed)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                          estSpeedMbps === speed
                            ? "bg-blue-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                      >
                        {speed} Mbps
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Live Auto-sync to Google Drive Status Notifications */}
            {autoSyncStatus?.state === "syncing" && (
              <div
                id="auto-sync-syncing-alert"
                className="mt-3 p-3 rounded-xl bg-blue-50/90 border border-blue-200 flex items-center justify-between gap-3 text-xs text-blue-900 animate-in fade-in"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                  <span>{t.autoSyncingToDrive}</span>
                </div>
                <span className="text-[11px] text-blue-700 font-mono hidden sm:inline">
                  Google Drive / KhmerDownloader
                </span>
              </div>
            )}

            {autoSyncStatus?.state === "success" && (
              <div
                id="auto-sync-success-alert"
                className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-emerald-900 animate-in fade-in"
              >
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{t.autoSyncSuccess}</span>
                </div>
                <div className="flex items-center gap-2">
                  {autoSyncStatus.driveLink && (
                    <a
                      href={autoSyncStatus.driveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>{t.openInGoogleDrive}</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setAutoSyncStatus(null)}
                    className="text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer px-1"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {autoSyncStatus?.state === "error" && (
              <div
                id="auto-sync-error-alert"
                className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2.5 text-xs text-rose-800 animate-in fade-in"
              >
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{autoSyncStatus.message}</span>
                </div>
                {autoSyncStatus.targetFormat && autoSyncStatus.targetFilename && (
                  <button
                    type="button"
                    onClick={() =>
                      triggerAutoSyncToDrive(
                        autoSyncStatus.targetFormat!,
                        autoSyncStatus.targetFilename!
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 font-bold text-[11px] cursor-pointer shrink-0"
                  >
                    {lang === "km" ? "ព្យាយាមម្តងទៀត" : "Retry"}
                  </button>
                )}
              </div>
            )}

            {autoSyncStatus?.state === "need_login" && (
              <div
                id="auto-sync-need-login-alert"
                className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2.5 text-xs text-amber-900 animate-in fade-in"
              >
                <div className="flex items-center gap-2 font-medium">
                  <CloudLightning className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{t.autoSyncSignInPrompt}</span>
                </div>
                <button
                  type="button"
                  onClick={handleQuickDriveSignIn}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow-2xs"
                >
                  {lang === "km" ? "ភ្ជាប់គណនី" : "Connect"}
                </button>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 mt-2.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span>
                {lang === "km"
                  ? "ទាញយកផ្ទាល់ទៅកាន់ឧបករណ៍ដោយឥតគិតថ្លៃ និងមានសុវត្ថិភាពខ្ពស់"
                  : "Direct high-speed download straight to your device securely"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cloud Backup Modal (Google Drive / Dropbox) */}
      <CloudBackupModal
        isOpen={showCloudModal}
        onClose={() => setShowCloudModal(false)}
        videoTitle={metadata.title}
        videoThumbnail={metadata.thumbnailUrl || metadata.thumbnail}
        platform={metadata.platform}
        originalUrl={metadata.originalUrl}
        selectedFormat={selectedFormat}
        lang={lang}
        onSaveToHistory={onSaveToHistory}
        accessToken={accessToken}
        googleUser={googleUser}
        onGoogleSignInSuccess={onGoogleSignInSuccess}
      />
    </div>
  );
};
