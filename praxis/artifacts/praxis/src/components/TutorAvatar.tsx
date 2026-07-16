import React, { useRef } from "react";

/**
 * Named Socratic tutor "face". Avatars are self-contained SVG presets (no image hosting)
 * plus optional custom uploads (stored as a resized data URL). The mouth animates while the
 * tutor is speaking (browser TTS), giving a lightweight "talking head" without a video service.
 */

export interface AvatarPreset {
  id: string;
  label: string;
  gender: "female" | "male";
  skin: string;
  hair: string;
  bg: string;
  long: boolean; // longer side hair
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "f1", label: "Naledi", gender: "female", skin: "#E8B98F", hair: "#2A1E16", bg: "#F3E1D2", long: true },
  { id: "f2", label: "Thandi", gender: "female", skin: "#8D5524", hair: "#141414", bg: "#EAD9C6", long: true },
  { id: "f3", label: "Ayesha", gender: "female", skin: "#C68642", hair: "#4A2E1C", bg: "#EFE0CF", long: true },
  { id: "m1", label: "Sipho", gender: "male", skin: "#E8B98F", hair: "#222", bg: "#DCE6EC", long: false },
  { id: "m2", label: "Bongani", gender: "male", skin: "#8D5524", hair: "#0F0F0F", bg: "#D7E3DA", long: false },
  { id: "m3", label: "Daniel", gender: "male", skin: "#C68642", hair: "#3A2A1E", bg: "#E4DEEC", long: false },
];

export function presetById(id?: string | null): AvatarPreset | undefined {
  return AVATAR_PRESETS.find((p) => p.id === id);
}

export function tutorGender(avatar?: string | null): "female" | "male" | null {
  return presetById(avatar ?? undefined)?.gender ?? null;
}

const isImageAvatar = (v?: string | null) => !!v && (v.startsWith("data:") || v.startsWith("http"));

/** The tutor face. `speaking` animates the mouth. */
export function TutorAvatar({ avatar, size = 56, speaking = false, ring = false }: { avatar?: string | null; size?: number; speaking?: boolean; ring?: boolean }) {
  const ringStyle: React.CSSProperties = ring
    ? { boxShadow: speaking ? "0 0 0 3px rgba(34,197,94,0.5)" : "0 0 0 2px rgba(0,0,0,0.06)", transition: "box-shadow 0.2s" }
    : {};

  if (isImageAvatar(avatar)) {
    return (
      <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", overflow: "hidden", ...ringStyle }}>
        <img src={avatar as string} alt="Tutor" width={size} height={size} style={{ objectFit: "cover", width: "100%", height: "100%", filter: speaking ? "none" : "none" }} />
      </span>
    );
  }

  const p = presetById(avatar) ?? AVATAR_PRESETS[0];
  const mouthStyle: React.CSSProperties = speaking
    ? { animation: "tutor-talk 0.26s ease-in-out infinite", transformOrigin: "center", transformBox: "fill-box" }
    : {};

  return (
    <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", overflow: "hidden", ...ringStyle }}>
      <style>{`@keyframes tutor-talk { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1.25); } }`}</style>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <rect width="100" height="100" fill={p.bg} />
        {/* Back hair for longer styles */}
        {p.long && <rect x="20" y="34" width="60" height="52" rx="26" fill={p.hair} />}
        {/* Neck + head */}
        <rect x="43" y="66" width="14" height="16" rx="6" fill={p.skin} />
        <ellipse cx="50" cy="50" rx="25" ry="27" fill={p.skin} />
        {/* Hair cap */}
        <path d={p.long
          ? "M24 50 C24 30 40 22 50 22 C60 22 76 30 76 50 C76 40 66 34 50 34 C34 34 24 40 24 50 Z"
          : "M26 48 C26 30 40 24 50 24 C60 24 74 30 74 48 C70 38 60 35 50 35 C40 35 30 38 26 48 Z"}
          fill={p.hair} />
        {/* Eyes */}
        <circle cx="41" cy="49" r="2.6" fill="#20303a" />
        <circle cx="59" cy="49" r="2.6" fill="#20303a" />
        {/* Brows */}
        <rect x="37" y="43.5" width="8" height="1.8" rx="0.9" fill={p.hair} />
        <rect x="55" y="43.5" width="8" height="1.8" rx="0.9" fill={p.hair} />
        {/* Mouth (animates when speaking) */}
        <ellipse cx="50" cy="62" rx="6" ry="2.4" fill="#7a3b3b" style={mouthStyle} />
      </svg>
    </span>
  );
}

/** Preset picker + custom image upload (resized client-side to a small data URL). */
export function AvatarPicker({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const S = 200;
        const canvas = document.createElement("canvas");
        canvas.width = S; canvas.height = S;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // cover-crop to square
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        onChange(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {AVATAR_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.id)}
          title={`${p.label} (${p.gender})`}
          className="rounded-full transition-transform hover:scale-105"
          style={{ outline: value === p.id ? "3px solid hsl(222 47% 30%)" : "2px solid transparent", outlineOffset: 2 }}
        >
          <TutorAvatar avatar={p.id} size={44} />
        </button>
      ))}

      {/* Custom uploaded avatar preview (if a data/url value is set) */}
      {isImageAvatar(value) && (
        <span className="rounded-full" style={{ outline: "3px solid hsl(222 47% 30%)", outlineOffset: 2 }}>
          <TutorAvatar avatar={value} size={44} />
        </span>
      )}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="h-11 w-11 rounded-full border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground hover:bg-muted"
        title="Upload a custom face"
      >
        +
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}
