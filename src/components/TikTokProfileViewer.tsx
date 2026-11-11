import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Pause,
  Download,
  Music,
  Film,
  ExternalLink,
  Sparkles,
  Layers,
  ChevronRight,
  ChevronLeft,
  Volume2,
  VolumeX,
  Eye,
  Heart,
  Clock,
  CheckCircle,
  X,
  SlidersHorizontal,
  Archive,
  CheckSquare,
  Square,
  Loader2,
  ListOrdered,
  FileCheck,
  Clapperboard,
  ArrowUpDown,
  Copy,
  Check,
  Link2,
} from "lucide-react";
import JSZip from "jszip";
import { TikTokProfileData, TikTokProfileVideo, Language, HistoryItem, VideoMetadata } from "../types";
import { translations } from "../translations";

interface TikTokProfileViewerProps {
  profile: TikTokProfileData;
  lang: Language;
  onSaveToHistory: (item: HistoryItem) => void;
  onSelectVideoForSingleView: (metadata: VideoMetadata) => void;
  onSendAllToBatch: (videos: TikTokProfileVideo[]) => void;
  onClose: () => void;
}

export const TikTokProfileViewer: React.FC<TikTokProfileViewerProps> = ({
  profile,
  lang,
  onSaveToHistory,
  onSelectVideoForSingleView,
  onSendAllToBatch,
  onClose,
}) => {
  const t = translations[lang];

  const isDrama =
    Boolean(profile.isDrama) ||
    profile.uniqueId === "shortdrama" ||
    profile.profileUrl.includes("shortdrama");

  // Auto-play state
  const [isAutoPlayActive, setIsAutoPlayActive] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  // Single download states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadSuccessId, setDownloadSuccessId] = useState<string | null>(null);

  // Bulk download & Selection states (មានចំនួនទាំងអស់)
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(
    () => new Set(profile.videos.map((v) => v.id))
  );
  const [bulkQuality, setBulkQuality] = useState<"1080p-full-hd" | "720p-hd" | "audio-mp3-320">("1080p-full-hd");
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkDownloadType, setBulkDownloadType] = useState<"zip" | "sequence" | null>(null);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
  const [bulkCurrentTitle, setBulkCurrentTitle] = useState("");
  const [bulkSuccessModal, setBulkSuccessModal] = useState(false);

  // Sorting state: 'newest' | 'oldest'
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [copiedVideoId, setCopiedVideoId] = useState<string | null>(null);
  const [copiedAllLinks, setCopiedAllLinks] = useState(false);

  // Sorted videos list based on 'Newest' or 'Oldest'
  const sortedVideos = useMemo(() => {
    const list = [...profile.videos];

    const getAgeWeight = (v: TikTokProfileVideo, indexInOriginal: number): number => {
      if (v.publishedAt) {
        const match = v.publishedAt.match(/(\d+)\s*([dhwmy])/i);
        if (match) {
          const num = parseInt(match[1], 10);
          const unit = match[2].toLowerCase();
          if (unit === "h") return num / 24;
          if (unit === "d") return num;
          if (unit === "w") return num * 7;
          if (unit === "m") return num * 30;
          if (unit === "y") return num * 365;
        }
      }
      if (typeof v.episodeNumber === "number") {
        // For episodes, higher episode number is newer
        return 100 - v.episodeNumber;
      }
      return indexInOriginal;
    };

    if (sortOrder === "newest") {
      return list.sort((a, b) => {
        const idxA = profile.videos.indexOf(a);
        const idxB = profile.videos.indexOf(b);
        return getAgeWeight(a, idxA) - getAgeWeight(b, idxB);
      });
    } else {
      return list.sort((a, b) => {
        const idxA = profile.videos.indexOf(a);
        const idxB = profile.videos.indexOf(b);
        return getAgeWeight(b, idxB) - getAgeWeight(a, idxA);
      });
    }
  }, [profile.videos, sortOrder]);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const currentVideo = profile.videos[currentVideoIndex] || profile.videos[0];

  // Video ended -> auto advance to next video
  const handleVideoEnded = () => {
    if (!isAutoPlayActive) return;
    advanceToNextVideo();
  };

  const advanceToNextVideo = () => {
    setCurrentVideoIndex((prev) => (prev + 1) % profile.videos.length);
  };

  const advanceToPrevVideo = () => {
    setCurrentVideoIndex((prev) => (prev - 1 + profile.videos.length) % profile.videos.length);
  };

  const handleCopyAllLinks = () => {
    const urls = sortedVideos
      .map((v) => `https://www.tiktok.com/@${profile.uniqueId}/video/${v.id}`)
      .join("\n");
    navigator.clipboard.writeText(urls);
    setCopiedAllLinks(true);
    setTimeout(() => setCopiedAllLinks(false), 2500);
  };

  // Play video on current index change
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      if (isPlaying) {
        videoRef.current.play().catch(() => {
          setIsMuted(true);
          videoRef.current?.play().catch(() => {});
        });
      }
    }
  }, [currentVideoIndex]);

  // Selection helpers (មានចំនួនទាំងអស់)
  const isAllSelected = selectedVideoIds.size === profile.videos.length;
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(profile.videos.map((v) => v.id)));
    }
  };

  const toggleSelectVideo = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Calculate estimated total size of selected videos
  const calculateTotalSizeMb = () => {
    let total = 0;
    const selectedVideos = profile.videos.filter((v) => selectedVideoIds.has(v.id));
    selectedVideos.forEach((v) => {
      const fmt = v.formats.find((f) => f.id === bulkQuality) || v.formats[0];
      if (fmt && fmt.fileSize) {
        const match = fmt.fileSize.match(/([\d.]+)/);
        if (match) total += parseFloat(match[1]);
      } else {
        total += 28.5;
      }
    });
    return total.toFixed(1);
  };

  // Single video direct download
  const handleDownloadVideo = (video: TikTokProfileVideo, formatType: "mp4" | "mp3" = "mp4") => {
    const format =
      formatType === "mp3"
        ? video.formats.find((f) => f.type === "audio") || video.formats[0]
        : video.formats.find((f) => f.id === "1080p-full-hd") || video.formats[0];

    if (!format) return;

    setDownloadingId(`${video.id}_${formatType}`);

    const safeTitle = video.title.replace(/[^a-zA-Z0-9_\u1780-\u17FF]/g, "_").slice(0, 36);
    const filename = `${safeTitle}_${format.quality}.${format.extension}`;
    const downloadUrl = `/api/proxy-download?url=${encodeURIComponent(format.url)}&filename=${encodeURIComponent(filename)}`;

    setTimeout(() => {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloadingId(null);
      setDownloadSuccessId(`${video.id}_${formatType}`);
      setTimeout(() => setDownloadSuccessId(null), 3000);

      onSaveToHistory({
        id: Math.random().toString(36).substring(2, 9),
        title: `[TikTok @${profile.uniqueId}] ${video.title}`,
        platform: "tiktok",
        thumbnail: video.thumbnail,
        downloadedAt: new Date().toLocaleDateString(lang === "km" ? "km-KH" : "en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        formatSelected: `${format.label} (${format.quality})`,
        fileSize: format.fileSize,
        downloadUrl,
        originalUrl: `https://www.tiktok.com/@${profile.uniqueId}`,
      });
    }, 1200);
  };

  // BULK DOWNLOAD 1: Download All as ZIP Archive (ទាញយកជាកញ្ចប់ ZIP ទាំងអស់)
  const handleDownloadAllAsZip = async () => {
    const targets = profile.videos.filter((v) => selectedVideoIds.has(v.id));
    if (targets.length === 0) return;

    setIsBulkDownloading(true);
    setBulkDownloadType("zip");
    setBulkProgress(5);
    setBulkCurrentIndex(0);

    const zip = new JSZip();
    const folderName = isDrama ? `TikTok_ShortDrama_Episodes` : `TikTok_@${profile.uniqueId}_videos`;
    const folder = zip.folder(folderName) || zip;

    try {
      for (let i = 0; i < targets.length; i++) {
        const vid = targets[i];
        setBulkCurrentIndex(i + 1);
        setBulkCurrentTitle(vid.title);
        setBulkProgress(Math.round(((i + 1) / targets.length) * 85));

        const targetFmt = vid.formats.find((f) => f.id === bulkQuality) || vid.formats[0];
        const safeTitle = isDrama
          ? `Ep_${String(i + 1).padStart(2, "0")}_${vid.title.replace(/[^a-zA-Z0-9_\u1780-\u17FF]/g, "_").slice(0, 32)}`
          : `${i + 1}_${vid.title.replace(/[^a-zA-Z0-9_\u1780-\u17FF]/g, "_").slice(0, 32)}`;
        const filename = `${safeTitle}.${targetFmt.extension}`;

        // Fetch proxy download blob
        try {
          const downloadUrl = `/api/proxy-download?url=${encodeURIComponent(targetFmt.url)}&filename=${encodeURIComponent(filename)}`;
          const res = await fetch(downloadUrl);
          if (res.ok) {
            const blob = await res.blob();
            folder.file(filename, blob);
          } else {
            // Text placeholder fallback
            folder.file(`${filename}.txt`, `TikTok Video from @${profile.uniqueId}\nTitle: ${vid.title}\nURL: ${targetFmt.url}`);
          }
        } catch {
          folder.file(`${filename}.txt`, `TikTok Video from @${profile.uniqueId}\nTitle: ${vid.title}\nURL: ${targetFmt.url}`);
        }

        // Save each item to history
        onSaveToHistory({
          id: Math.random().toString(36).substring(2, 9),
          title: isDrama ? `[TikTok Short Drama] ${vid.title}` : `[TikTok Profile ZIP] ${vid.title}`,
          platform: "tiktok",
          thumbnail: vid.thumbnail,
          downloadedAt: new Date().toLocaleDateString(lang === "km" ? "km-KH" : "en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          formatSelected: `${targetFmt.label} (${targetFmt.quality})`,
          fileSize: targetFmt.fileSize,
          downloadUrl: targetFmt.url,
          originalUrl: profile.profileUrl,
        });
      }

      setBulkProgress(92);
      setBulkCurrentTitle(t.zippingProgress);

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 4 },
      });

      setBulkProgress(100);

      // Trigger zip download
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = isDrama
        ? `TikTok_ShortDrama_All_${targets.length}_Episodes_HD.zip`
        : `TikTok_@${profile.uniqueId}_All_${targets.length}_Videos.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zipUrl);

      setTimeout(() => {
        setIsBulkDownloading(false);
        setBulkSuccessModal(true);
      }, 500);
    } catch (err) {
      console.error("ZIP creation error:", err);
      setIsBulkDownloading(false);
    }
  };

  // BULK DOWNLOAD 2: Sequential Automatic Downloads (ទាញយកម្តងមួយៗដោយស្វ័យប្រវត្តិ)
  const handleDownloadAllSequential = async () => {
    const targets = profile.videos.filter((v) => selectedVideoIds.has(v.id));
    if (targets.length === 0) return;

    setIsBulkDownloading(true);
    setBulkDownloadType("sequence");
    setBulkProgress(0);

    for (let i = 0; i < targets.length; i++) {
      const vid = targets[i];
      setBulkCurrentIndex(i + 1);
      setBulkCurrentTitle(vid.title);
      setBulkProgress(Math.round(((i + 1) / targets.length) * 100));

      const targetFmt = vid.formats.find((f) => f.id === bulkQuality) || vid.formats[0];
      const safeTitle = `${i + 1}_${vid.title.replace(/[^a-zA-Z0-9_\u1780-\u17FF]/g, "_").slice(0, 32)}`;
      const filename = `${safeTitle}.${targetFmt.extension}`;
      const downloadUrl = `/api/proxy-download?url=${encodeURIComponent(targetFmt.url)}&filename=${encodeURIComponent(filename)}`;

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      onSaveToHistory({
        id: Math.random().toString(36).substring(2, 9),
        title: `[TikTok @${profile.uniqueId}] ${vid.title}`,
        platform: "tiktok",
        thumbnail: vid.thumbnail,
        downloadedAt: new Date().toLocaleDateString(lang === "km" ? "km-KH" : "en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        formatSelected: `${targetFmt.label} (${targetFmt.quality})`,
        fileSize: targetFmt.fileSize,
        downloadUrl,
        originalUrl: `https://www.tiktok.com/@${profile.uniqueId}`,
      });

      // Pause between triggers to avoid browser download spam blocks
      await new Promise((resolve) => setTimeout(resolve, 850));
    }

    setIsBulkDownloading(false);
    setBulkSuccessModal(true);
  };

  // Open detailed single result card
  const handleOpenDetailedView = (video: TikTokProfileVideo) => {
    const metadata: VideoMetadata = {
      id: video.id,
      platform: "tiktok",
      originalUrl: `https://www.tiktok.com/@${profile.uniqueId}`,
      title: video.title,
      author: {
        name: profile.nickname,
        username: `@${profile.uniqueId}`,
        avatarUrl: profile.avatar,
      },
      duration: video.duration,
      durationFormatted: video.durationFormatted,
      thumbnail: video.thumbnail,
      thumbnailUrl: video.thumbnail,
      views: video.views,
      likes: video.likes,
      comments: video.comments,
      shares: video.shares,
      formats: video.formats,
      aspectRatio: "9:16",
      createdAt: new Date().toISOString(),
    };
    onSelectVideoForSingleView(metadata);
  };

  return (
    <div id="tiktok-profile-viewer" className="mt-8 space-y-6">
      {/* Profile Header Hero Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-5 sm:p-8 text-white shadow-2xl border border-slate-700/60">
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Avatar and user details */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="relative shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full p-1 bg-gradient-to-tr from-[#00f2fe] via-[#4facfe] to-[#fe2c55] shadow-lg">
                <img
                  src={profile.avatar}
                  alt={profile.nickname}
                  referrerPolicy="no-referrer"
                  className="w-full h-full rounded-full object-cover bg-slate-800"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop";
                  }}
                />
              </div>
              <span className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-[#fe2c55] text-white flex items-center justify-center text-xs font-black shadow-md border-2 border-slate-900">
                ♪
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {isDrama && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 via-rose-500 to-purple-600 text-slate-950 text-xs font-black uppercase tracking-wider shadow-md">
                    <Clapperboard className="w-3.5 h-3.5" />
                    <span>{t.shortDramaBadge}</span>
                  </span>
                )}
                <h3 className="text-xl sm:text-2xl font-black tracking-tight">{profile.nickname}</h3>
                {profile.isVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 text-[11px] font-bold">
                    <CheckCircle className="w-3 h-3 text-cyan-400" />
                    Verified
                  </span>
                )}
                <span className="text-xs font-bold text-slate-300 font-mono">@{profile.uniqueId}</span>
              </div>

              {/* Bio */}
              <p className="text-slate-300 text-xs sm:text-sm mt-1.5 max-w-xl whitespace-pre-line leading-relaxed font-normal">
                {profile.bio}
              </p>

              {/* Engagement Stats row with Total Video Count */}
              <div className="flex items-center gap-4 sm:gap-6 mt-3 pt-3 border-t border-slate-700/60 text-xs">
                <div>
                  <span className="font-extrabold text-white text-sm sm:text-base block">
                    {profile.followersFormatted}
                  </span>
                  <span className="text-slate-400 text-[11px]">{t.profileFollowers}</span>
                </div>
                <div>
                  <span className="font-extrabold text-white text-sm sm:text-base block">
                    {profile.likesFormatted}
                  </span>
                  <span className="text-slate-400 text-[11px]">{t.profileLikes}</span>
                </div>
                <div className="px-3 py-1 rounded-xl bg-white/10 border border-white/15">
                  <span className="font-extrabold text-cyan-400 text-sm sm:text-base block font-mono">
                    {profile.videoCount} {isDrama ? t.episodesCount : t.profileVideosCount}
                  </span>
                  <span className="text-slate-300 text-[11px]">{isDrama ? (lang === "km" ? "គ្រប់ភាគទាំងអស់" : "All Episodes") : t.totalCountBadge}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons right */}
          <div className="flex flex-wrap sm:flex-col items-stretch gap-2.5 w-full md:w-auto shrink-0">
            <a
              href={profile.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all cursor-pointer backdrop-blur-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{t.openOnTikTok}</span>
            </a>

            {/* Main Action: Download All Videos */}
            <button
              type="button"
              onClick={handleDownloadAllAsZip}
              disabled={isBulkDownloading}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/25 transition-all cursor-pointer active:scale-98 disabled:opacity-75"
            >
              <Archive className="w-4 h-4" />
              <span>{isDrama ? `${t.downloadAllEpisodes} (${selectedVideoIds.size})` : `${t.downloadAllProfileVideos} (${selectedVideoIds.size})`}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs border border-slate-700 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{t.closeBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Scanned Video Links Status Banner (ស្កេនរក Link វីដេអូដោយស្វ័យប្រវត្តិ) */}
      <div className="bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-cyan-500/15 border border-emerald-400/50 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md shrink-0">
            <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-extrabold text-slate-900">
                {lang === "km" ? "ប្រព័ន្ធបានស្កេនរកឃើញ Link វីដេអូដោយស្វ័យប្រវត្តិ" : "Auto-Scanned Video Links Found"}
              </h4>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-black font-mono shadow-2xs">
                {sortedVideos.length} {lang === "km" ? "វីដេអូ" : "Videos"}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              {lang === "km"
                ? `បានស្កេន និងទាញយក Link វីដេអូពី Profile @${profile.uniqueId} មកដាក់ក្នុងបញ្ជីរួចរាល់ អាចទាញយក ឬចម្លង Link បានភ្លាមៗ`
                : `Scanned & retrieved video links from @${profile.uniqueId} ready for download or copying`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={handleCopyAllLinks}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-98"
          >
            {copiedAllLinks ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">{lang === "km" ? "បានចម្លង Link ទាំងអស់!" : "Copied All Links!"}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                <span>{lang === "km" ? `ចម្លង Link ទាំងអស់ (${sortedVideos.length})` : `Copy All (${sortedVideos.length})`}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSendAllToBatch(sortedVideos.filter((v) => selectedVideoIds.has(v.id)))}
            disabled={selectedVideoIds.size === 0}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-60 active:scale-98"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t.addAllToBatch}</span>
          </button>
        </div>
      </div>

      {/* Quick Episode Navigator (if Drama) */}
      {isDrama && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border border-amber-500/40 rounded-3xl p-4 sm:p-5 shadow-xl text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-700/60 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
                <Clapperboard className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-white tracking-wide uppercase">
                  {lang === "km" ? "ជ្រើសរើសភាគរឿងខ្លី (Short Drama Episodes)" : "Drama Episodes Selector"}
                </h4>
                <p className="text-[11px] text-amber-200/80">
                  {lang === "km" ? "ចុចលើភាគណាមួយដើម្បីទស្សនា និងទាញយកកម្រិត 4K UHD / 1080p FHD គ្មាន Watermark" : "Click any episode to watch & download in 4K UHD / 1080p FHD"}
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-400/20 text-amber-300 border border-amber-400/30 shrink-0">
              {t.episode} {currentVideoIndex + 1} / {profile.videos.length} {t.episodesCount}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
            {profile.videos.map((vid, i) => {
              const isCurrent = i === currentVideoIndex;
              return (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => {
                    setCurrentVideoIndex(i);
                    setIsPlaying(true);
                    document.getElementById("tiktok-auto-player-card")?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isCurrent
                      ? "bg-gradient-to-r from-amber-400 via-rose-500 to-purple-600 text-slate-950 shadow-lg font-black scale-105 ring-2 ring-amber-300"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600"
                  }`}
                >
                  <Film className={`w-3.5 h-3.5 ${isCurrent ? "text-slate-950" : "text-amber-400"}`} />
                  <span>{t.episode} {String(i + 1).padStart(2, "0")}</span>
                  <span className={`text-[10px] font-mono ${isCurrent ? "text-slate-950" : "text-slate-400"}`}>
                    ({vid.durationFormatted})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* DEDICATED BULK DOWNLOAD DASHBOARD (ទាញយកវីដេអូពី Profile TikTok មានចំនួនទាំងអស់) */}
      <div
        id="tiktok-bulk-download-panel"
        data-testid="tiktok-bulk-download-panel"
        className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-blue-700/60"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-indigo-700/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shadow-md">
                <Download className="w-4 h-4 stroke-[2.5]" />
              </span>
              <div>
                <h4 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  <span>{isDrama ? t.shortDramaTitle : t.downloadAllProfileCount}</span>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-400 text-slate-950 text-[10px] font-black uppercase">
                    {isDrama ? "4K/1080p Drama" : "Bulk Engine"}
                  </span>
                </h4>
                <p className="text-xs text-indigo-200 mt-0.5">
                  {isDrama
                    ? (lang === "km"
                        ? `មានចំនួនភាគរឿងសរុប ${profile.videoCount} ភាគ • ទាញយកគ្រប់ភាគកម្រិតខ្ពស់ 1080p FHD / 4K UHD គ្មាន Watermark ជាកញ្ចប់ ZIP តែមួយ`
                        : `Total ${profile.videoCount} drama episodes • Download all in high quality 1080p FHD / 4K UHD without watermark as a single ZIP archive`)
                    : (lang === "km"
                        ? `មានចំនួនវីដេអូសរុប ${profile.videoCount} វីដេអូ • អាចទាញយកទាំងអស់ជាកញ្ចប់ ZIP តែមួយ ឬម្តងមួយៗដោយស្វ័យប្រវត្តិ`
                        : `Total ${profile.videoCount} profile videos • Download all at once as a single ZIP archive or auto-sequence`)}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Select All Toggle & Selection Counter */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition-all cursor-pointer"
            >
              {isAllSelected ? (
                <>
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                  <span>{t.deselectAllProfileVideos}</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 text-cyan-400" />
                  <span>{t.selectAllProfileVideos} ({profile.videos.length})</span>
                </>
              )}
            </button>

            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold font-mono">
              {t.selectedVideosCount}: {selectedVideoIds.size} / {profile.videos.length} (~{calculateTotalSizeMb()} MB)
            </div>
          </div>
        </div>

        {/* Bulk Download Options Controls */}
        <div className="mt-4 pt-1 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Quality format selector */}
          <div className="md:col-span-5 flex items-center gap-2.5">
            <span className="text-xs font-bold text-slate-300 shrink-0">
              {t.chooseQualityForBulk}
            </span>
            <select
              value={bulkQuality}
              onChange={(e) => setBulkQuality(e.target.value as any)}
              className="flex-1 bg-slate-800 text-white border border-indigo-500/60 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
            >
              <option value="1080p-full-hd">🎥 Full HD 1080p (គ្មាន Watermark)</option>
              <option value="720p-hd">🎥 HD 720p (ទំហំស្រាល)</option>
              <option value="audio-mp3-320">🎵 សំឡេង MP3 (320 kbps Audio Only)</option>
            </select>
          </div>

          {/* Bulk Action Buttons */}
          <div className="md:col-span-7 flex flex-wrap sm:flex-nowrap items-center gap-2.5">
            {/* Download as ZIP Package */}
            <button
              id="bulk-download-zip-btn"
              data-testid="bulk-download-zip-btn"
              type="button"
              onClick={handleDownloadAllAsZip}
              disabled={isBulkDownloading || selectedVideoIds.size === 0}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs sm:text-sm shadow-md shadow-emerald-500/30 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isBulkDownloading && bulkDownloadType === "zip" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>{bulkProgress}% ({bulkCurrentIndex}/{selectedVideoIds.size})</span>
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 stroke-[2.5]" />
                  <span>{isDrama ? t.downloadAllEpisodes : t.downloadAsZip}</span>
                </>
              )}
            </button>

            {/* Sequential Direct Download */}
            <button
              id="bulk-download-sequence-btn"
              data-testid="bulk-download-sequence-btn"
              type="button"
              onClick={handleDownloadAllSequential}
              disabled={isBulkDownloading || selectedVideoIds.size === 0}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isBulkDownloading && bulkDownloadType === "sequence" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>{bulkProgress}% ({bulkCurrentIndex}/{selectedVideoIds.size})</span>
                </>
              ) : (
                <>
                  <ListOrdered className="w-4 h-4 stroke-[2.5]" />
                  <span>{t.downloadSequential}</span>
                </>
              )}
            </button>

            {/* Send to Batch Downloader */}
            <button
              type="button"
              onClick={() => onSendAllToBatch(profile.videos.filter((v) => selectedVideoIds.has(v.id)))}
              disabled={selectedVideoIds.size === 0}
              className="py-3 px-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-60"
              title={t.addAllToBatch}
            >
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">Batch</span>
            </button>
          </div>
        </div>

        {/* Live Bulk Download Progress Bar (When Active) */}
        {isBulkDownloading && (
          <div className="mt-4 pt-3 border-t border-indigo-700/50 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {bulkDownloadType === "zip" ? t.zippingProgress : t.bulkDownloadingTitle}: {bulkCurrentIndex} / {selectedVideoIds.size}
                </span>
              </span>
              <span className="font-mono font-bold text-emerald-400">{bulkProgress}%</span>
            </div>

            <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-indigo-500/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 transition-all duration-200"
                style={{ width: `${Math.max(4, Math.min(100, bulkProgress))}%` }}
              />
            </div>

            <p className="text-[11px] text-slate-300 truncate font-mono">
              {bulkCurrentTitle}
            </p>
          </div>
        )}
      </div>

      {/* Success Modal / Banner */}
      {bulkSuccessModal && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 shadow-sm flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h5 className="font-bold text-sm text-emerald-950">{t.bulkDownloadSuccess}</h5>
              <p className="text-xs text-emerald-700 mt-0.5">
                {lang === "km"
                  ? `បានទាញយក និងរក្សាទុកវីដេអូទាំងអស់ (${selectedVideoIds.size} វីដេអូ) ពី Profile @${profile.uniqueId}`
                  : `Successfully saved all ${selectedVideoIds.size} videos from TikTok profile @${profile.uniqueId}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBulkSuccessModal(false)}
            className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* AUTO-VIEWER SHOWCASE (មើលវីដេអូទាំងអស់ដោយស្វ័យប្រវត្តិ) */}
      <div
        id="tiktok-auto-player-card"
        className="bg-white rounded-3xl border border-slate-200 shadow-xl p-5 sm:p-7 overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#fe2c55] to-[#25f4ee] flex items-center justify-center text-white font-black text-xs shadow-md shadow-pink-500/20">
              ▶
            </div>
            <div>
              <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight flex items-center gap-2">
                <span>{isDrama ? `${t.shortDramaBadge} • ${t.episode} ${currentVideoIndex + 1}` : t.autoPlayAllVideos}</span>
                <span className="px-2 py-0.5 rounded-md bg-pink-50 text-pink-700 text-[10px] font-extrabold uppercase border border-pink-200">
                  {isDrama ? "Episode Player" : "Live Feed"}
                </span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.playingVideo} {currentVideoIndex + 1} {t.of} {profile.videos.length} • {currentVideo.title}
              </p>
            </div>
          </div>

          {/* Auto-Play Toggle switch */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span>{t.autoPlayNextVideo}</span>
              <button
                type="button"
                role="switch"
                aria-checked={isAutoPlayActive}
                onClick={() => setIsAutoPlayActive(!isAutoPlayActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isAutoPlayActive ? "bg-[#fe2c55]" : "bg-slate-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    isAutoPlayActive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Video Player Display with Overlay & Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Vertical Video Viewport */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-xs sm:max-w-sm aspect-[9/16] bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-900 group">
              <video
                ref={videoRef}
                src={currentVideo.videoUrl.startsWith("http") ? `/api/proxy-download?url=${encodeURIComponent(currentVideo.videoUrl)}&inline=true` : currentVideo.videoUrl}
                poster={currentVideo.thumbnail}
                playsInline
                autoPlay={isAutoPlayActive}
                muted={isMuted}
                onEnded={handleVideoEnded}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setIsPlaying(!isPlaying)}
              />

              {/* Top info badge */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
                <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>
                    #{currentVideoIndex + 1} / {profile.videos.length}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className="pointer-events-auto p-2 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white shadow-md transition-all cursor-pointer"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-pink-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
                </button>
              </div>

              {/* Bottom Playback Overlay */}
              <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent text-white z-10">
                <p className="text-xs font-bold line-clamp-2 leading-snug drop-shadow-sm mb-2">
                  {currentVideo.title}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{currentVideo.views}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 text-pink-500" />
                      <span>{currentVideo.likes}</span>
                    </span>
                  </div>
                  <span className="font-mono">{currentVideo.durationFormatted}</span>
                </div>
              </div>

              {/* Center Play/Pause Indicator on hover/pause */}
              {!isPlaying && (
                <div
                  onClick={() => {
                    setIsPlaying(true);
                    videoRef.current?.play();
                  }}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer z-20"
                >
                  <div className="w-16 h-16 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-2xl pl-1">
                    <Play className="w-8 h-8 fill-slate-900 stroke-none" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Player Controls & Quick Download Dashboard */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  {isDrama ? `${t.episode} ${currentVideoIndex + 1}` : `TikTok Reel #${currentVideoIndex + 1}`}
                </span>
                <span className="text-xs text-slate-500 font-medium">{currentVideo.publishedAt}</span>
              </div>

              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug">
                {currentVideo.title}
              </h3>

              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-xs text-slate-500 block mb-0.5">{t.viewsMetric}</span>
                  <span className="font-black text-slate-900 text-sm sm:text-base font-mono">
                    {currentVideo.views}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-pink-50/60 border border-pink-200/80 text-center">
                  <span className="text-xs text-pink-700 block mb-0.5">{t.likesMetric}</span>
                  <span className="font-black text-pink-900 text-sm sm:text-base font-mono">
                    {currentVideo.likes}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 text-center">
                  <span className="text-xs text-indigo-700 block mb-0.5">{t.durationMetric}</span>
                  <span className="font-black text-indigo-900 text-sm sm:text-base font-mono">
                    {currentVideo.durationFormatted}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation & Continuous Playback Controls */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isAutoPlayActive ? t.autoPlayNextVideo : t.autoPlayPaused}</span>
                </span>
                <span className="text-xs font-mono font-bold text-slate-500">
                  {currentVideoIndex + 1} / {profile.videos.length}
                </span>
              </div>

              {/* Progress bar showing position in playlist */}
              <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-indigo-600 to-[#fe2c55] transition-all duration-300"
                  style={{
                    width: `${((currentVideoIndex + 1) / profile.videos.length) * 100}%`,
                  }}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={advanceToPrevVideo}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>មុន (Prev)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = !isPlaying;
                    setIsPlaying(next);
                    if (next) videoRef.current?.play();
                    else videoRef.current?.pause();
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-white" />
                      <span>ផ្អាក (Pause)</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>ចាក់ (Play)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={advanceToNextVideo}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs"
                >
                  <span>បន្ទាប់ (Next)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Direct Instant Download Buttons for the Active Video */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                <button
                  type="button"
                  onClick={() => handleDownloadVideo(currentVideo, "mp4")}
                  disabled={downloadingId === `${currentVideo.id}_mp4`}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-75"
                >
                  {downloadSuccessId === `${currentVideo.id}_mp4` ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-300" />
                      <span>{t.downloadComplete}</span>
                    </>
                  ) : downloadingId === `${currentVideo.id}_mp4` ? (
                    <span>{t.downloading}</span>
                  ) : (
                    <>
                      <Film className="w-4 h-4" />
                      <span>{t.downloadVideoHd} (1080p No Watermark)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadVideo(currentVideo, "mp3")}
                  disabled={downloadingId === `${currentVideo.id}_mp3`}
                  className="sm:w-auto py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-purple-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-75"
                >
                  <Music className="w-4 h-4" />
                  <span>{t.downloadAudioMp3}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenDetailedView(currentVideo)}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                <span>{lang === "km" ? "បើកផ្ទាំងទាញយកលម្អិត (កែប្រែគុណភាព / Trimming)" : "Open in Advanced Quality Downloader"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FULL PROFILE VIDEO GALLERY / GRID (វីដេអូទាំងអស់ពី Profile) */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-slate-200">
          <div>
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
              <span>{isDrama ? (lang === "km" ? "🎬 បញ្ជីភាគរឿងខ្លីទាំងអស់ (Short Drama Episodes)" : "🎬 Drama Episodes Collection") : t.tiktokProfileTitle}</span>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-900 border border-cyan-200 text-xs font-black">
                {profile.videoCount} {isDrama ? t.episodesCount : t.profileVideosCount}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                {selectedVideoIds.size} {t.selectedOf}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isDrama
                ? (lang === "km"
                    ? "ជ្រើសរើសភាគដើម្បីទាញយកជាកញ្ចប់ ZIP (4K/1080p FHD គ្មាន Watermark) ឬចុចលើភាគនីមួយៗដើម្បីចាក់មើល"
                    : "Select episodes to download in bulk (4K/1080p FHD no watermark) or click to play")
                : (lang === "km"
                    ? "ជ្រើសរើសវីដេអូដើម្បីទាញយកជាកញ្ចប់ ឬចុចលើវីដេអូនីមួយៗដើម្បីចាក់មើល"
                    : "Select videos to download in bulk or click individual videos to play")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Sorting Feature: Newest or Oldest */}
            <div
              id="tiktok-videos-sort-controls"
              data-testid="tiktok-videos-sort-controls"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-2xs"
            >
              <div className="hidden sm:flex items-center gap-1 pl-2 pr-1 text-slate-500 text-xs font-bold">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{t.sortBy}</span>
              </div>

              {/* Accessible Dropdown Select for automated testing */}
              <div className="relative sm:hidden">
                <select
                  id="tiktok-sort-select"
                  data-testid="tiktok-sort-select"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-800 border border-slate-200 focus:outline-none"
                  aria-label="Sort videos by"
                >
                  <option value="newest">{t.sortNewest}</option>
                  <option value="oldest">{t.sortOldest}</option>
                </select>
              </div>

              {/* Segmented Controls for Desktop & Tablet */}
              <div className="hidden sm:flex items-center gap-1" role="group" aria-label="Sort order">
                <button
                  type="button"
                  id="sort-newest-btn"
                  data-testid="sort-newest-btn"
                  onClick={() => setSortOrder("newest")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    sortOrder === "newest"
                      ? "bg-white text-blue-600 shadow-xs font-extrabold border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                  aria-pressed={sortOrder === "newest"}
                  title={lang === "km" ? "តម្រៀបវីដេអូថ្មីបំផុតមុន" : "Sort videos with newest first"}
                >
                  <span>{t.sortNewest}</span>
                </button>

                <button
                  type="button"
                  id="sort-oldest-btn"
                  data-testid="sort-oldest-btn"
                  onClick={() => setSortOrder("oldest")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    sortOrder === "oldest"
                      ? "bg-white text-blue-600 shadow-xs font-extrabold border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                  aria-pressed={sortOrder === "oldest"}
                  title={lang === "km" ? "តម្រៀបវីដេអូចាស់បំផុតមុន" : "Sort videos with oldest first"}
                >
                  <span>{t.sortOldest}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadAllAsZip}
              disabled={isBulkDownloading || selectedVideoIds.size === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-60"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{isDrama ? `${t.downloadAllEpisodes} (${selectedVideoIds.size})` : `${t.downloadAsZip} (${selectedVideoIds.size})`}</span>
            </button>

            <button
              type="button"
              onClick={() => onSendAllToBatch(sortedVideos.filter((v) => selectedVideoIds.has(v.id)))}
              disabled={selectedVideoIds.size === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-bold transition-all cursor-pointer shadow-2xs disabled:opacity-60"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t.addAllToBatch}</span>
            </button>
          </div>
        </div>

        {/* Video Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {sortedVideos.map((video, idx) => {
            const isCurrent = profile.videos[currentVideoIndex]?.id === video.id;
            const isSelected = selectedVideoIds.has(video.id);

            return (
              <div
                key={video.id}
                className={`group relative flex flex-col bg-white rounded-2xl border overflow-hidden shadow-xs hover:shadow-lg transition-all duration-200 ${
                  isSelected ? "ring-2 ring-blue-500 border-blue-300 bg-blue-50/15" : "border-slate-200 hover:border-slate-300"
                } ${isCurrent ? "shadow-md" : ""}`}
              >
                {/* Thumbnail 9:16 Aspect ratio */}
                <div
                  className="relative aspect-[9/16] bg-slate-900 overflow-hidden cursor-pointer"
                  onClick={() => {
                    const originalIdx = profile.videos.findIndex((v) => v.id === video.id);
                    setCurrentVideoIndex(originalIdx !== -1 ? originalIdx : 0);
                    setIsPlaying(true);
                    document.getElementById("tiktok-auto-player-card")?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }}
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />

                  {/* Top Checkbox & Index Badges */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                    <button
                      type="button"
                      onClick={(e) => toggleSelectVideo(video.id, e)}
                      className={`p-1.5 rounded-lg backdrop-blur-md transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-md scale-105"
                          : "bg-black/60 text-white hover:bg-black/80"
                      }`}
                      title={isSelected ? t.deselectAllProfileVideos : t.selectAllProfileVideos}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4 text-white" /> : <Square className="w-4 h-4 text-white/90" />}
                    </button>

                    <div className="flex items-center gap-1">
                      {isDrama && (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-black uppercase shadow-xs">
                          {t.episode} {String(video.episodeNumber || idx + 1).padStart(2, "0")}
                        </span>
                      )}
                      {video.publishedAt && (
                        <span className="px-1.5 py-0.5 rounded-md bg-white/20 backdrop-blur-xs text-white text-[10px] font-mono font-bold pointer-events-none">
                          {video.publishedAt}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono font-bold pointer-events-none">
                        {video.durationFormatted}
                      </span>
                    </div>
                  </div>

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-xl pl-0.5">
                      <Play className="w-5 h-5 fill-slate-900 stroke-none" />
                    </div>
                  </div>

                  {/* Bottom Stats Gradient */}
                  <div className="absolute bottom-0 inset-x-0 p-2.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex items-center justify-between text-white text-[10px] font-medium pointer-events-none">
                    <span className="flex items-center gap-1 font-bold">
                      <Eye className="w-3.5 h-3.5 text-cyan-300" />
                      <span>{video.views}</span>
                    </span>
                    <span className="flex items-center gap-1 font-bold">
                      <Heart className="w-3.5 h-3.5 text-pink-400" />
                      <span>{video.likes}</span>
                    </span>
                  </div>
                </div>

                {/* Card Content & Action Bar */}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-1.5 mb-2">
                    <p
                      className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug cursor-pointer hover:text-blue-600"
                      onClick={() => {
                        const originalIdx = profile.videos.findIndex((v) => v.id === video.id);
                        setCurrentVideoIndex(originalIdx !== -1 ? originalIdx : 0);
                        setIsPlaying(true);
                        document.getElementById("tiktok-auto-player-card")?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                      title={video.title}
                    >
                      {video.title}
                    </p>
                  </div>

                  {/* Scanned Video Link & Copy Actions */}
                  <div className="flex items-center justify-between gap-1 mb-2 px-2 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-[10px] font-mono text-slate-500">
                    <span className="truncate max-w-[120px] text-slate-600 font-semibold" title={`https://www.tiktok.com/@${profile.uniqueId}/video/${video.id}`}>
                      video/{video.id}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(`https://www.tiktok.com/@${profile.uniqueId}/video/${video.id}`);
                          setCopiedVideoId(video.id);
                          setTimeout(() => setCopiedVideoId(null), 2000);
                        }}
                        className="p-0.5 hover:text-blue-600 transition-colors cursor-pointer"
                        title={lang === "km" ? "ចម្លង Link វីដេអូ" : "Copy Link"}
                      >
                        {copiedVideoId === video.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400 hover:text-slate-700" />
                        )}
                      </button>
                      <a
                        href={`https://www.tiktok.com/@${profile.uniqueId}/video/${video.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors"
                        title={lang === "km" ? "បើកលើ TikTok" : "Open in TikTok"}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleDownloadVideo(video, "mp4")}
                      disabled={downloadingId === `${video.id}_mp4`}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-70"
                      title={t.downloadVideoHd}
                    >
                      <Download className="w-3 h-3" />
                      <span>HD</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadVideo(video, "mp3")}
                      disabled={downloadingId === `${video.id}_mp3`}
                      className="py-1.5 px-2 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-70"
                      title={t.downloadAudioMp3}
                    >
                      <Music className="w-3 h-3" />
                      <span>MP3</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenDetailedView(video)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      title={lang === "km" ? "មើលព័ត៌មានលម្អិត" : "Details"}
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
