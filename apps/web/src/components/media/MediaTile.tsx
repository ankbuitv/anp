import type { Media } from "@anp/api-types";
import { Icon } from "../common/Icons";
import { cn } from "../common/Ui";
import { useUi } from "../../store/ui";

export function MediaTile({
  media,
  selected,
  onClick,
  onContext,
}: {
  media: Media;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContext: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-anp-media", media.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onClick}
      onContextMenu={onContext}
      onPointerDown={(e) => {
        if (e.pointerType === "touch") {
          const t = window.setTimeout(() => useUi.getState().toggleSelect(media.id), 420);
          const clear = () => window.clearTimeout(t);
          e.currentTarget.addEventListener("pointerup", clear, { once: true });
          e.currentTarget.addEventListener("pointercancel", clear, { once: true });
        }
      }}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg bg-elev",
        selected && "ring-2 ring-bronze ring-offset-2 ring-offset-ink",
      )}
    >
      <img
        src={media.thumbUrl}
        alt={media.filename}
        loading="lazy"
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
      />
      {media.mediaType === "video" ? (
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
          <Icon.Play size={10} className="inline" /> video
        </span>
      ) : null}
      {media.isFavorite ? (
        <span className="absolute right-1.5 top-1.5 text-bronze">
          <Icon.StarFill size={14} />
        </span>
      ) : null}
      <span
        className={cn(
          "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md border border-white/30 bg-black/30 text-[10px] text-white opacity-0 group-hover:opacity-100",
          selected && "opacity-100 bg-bronze text-ink border-bronze",
        )}
        onClick={(e) => {
          e.stopPropagation();
          useUi.getState().toggleSelect(media.id);
        }}
      >
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}
