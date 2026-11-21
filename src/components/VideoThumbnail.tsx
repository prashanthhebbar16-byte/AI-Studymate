import { Play } from "lucide-react";
import { useState } from "react";

interface VideoThumbnailProps {
  src: string;
  alt: string;
  duration?: string;
}

export function VideoThumbnail({ src, alt, duration }: VideoThumbnailProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-slate-900">
      {!failed && src ? (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 px-4 text-center text-slate-300">
          <Play className="h-7 w-7 text-blue-400" />
          <span className="line-clamp-2 text-xs font-medium text-slate-300">{alt}</span>
        </div>
      )}

      {duration && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/75 via-black/25 to-transparent p-2.5">
          <span className="font-mono text-xs font-medium text-white tabular-nums">
            {duration}
          </span>
        </div>
      )}
    </div>
  );
}
