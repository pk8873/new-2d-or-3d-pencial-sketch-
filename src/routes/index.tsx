import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Studio,
  head: () => ({
    meta: [
      { title: "Toonify Studio — Browser Video Stylizer (FFmpeg.wasm)" },
      {
        name: "description",
        content:
          "Upload any video and apply cartoon, 2D, 3D-pop and color styles right in your browser. 100% free, no upload to any server.",
      },
    ],
  }),
});

type Style = {
  id: string;
  name: string;
  tagline: string;
  swatch: string;
  // ffmpeg -vf filter chain
  vf: string;
};

const STYLES: Style[] = [
  {
    id: "cartoon",
    name: "Cartoon Pop",
    tagline: "Bold edges, flat color, comic vibe",
    swatch: "linear-gradient(135deg,#ff3ea5,#ffd23f)",
    vf: "edgedetect=low=0.1:high=0.4,negate,format=yuv420p,eq=saturation=1.6:contrast=1.25",
  },
  {
    id: "anime",
    name: "Anime Soft",
    tagline: "Soft pastel, painterly look",
    swatch: "linear-gradient(135deg,#a0e7ff,#ffb3d9)",
    vf: "smartblur=lr=2:ls=-0.6,eq=saturation=1.4:brightness=0.04:contrast=1.05,hue=h=8",
  },
  {
    id: "toon2d",
    name: "2D Flat",
    tagline: "Posterized flat colors",
    swatch: "linear-gradient(135deg,#7CFFB2,#00C2FF)",
    vf: "eq=saturation=1.5:contrast=1.2,curves=preset=strong_contrast,hqdn3d=4:3:6:6",
  },
  {
    id: "pop3d",
    name: "3D Pop",
    tagline: "Punchy color, deep contrast, sharp",
    swatch: "linear-gradient(135deg,#ffb800,#ff2bd6)",
    vf: "unsharp=5:5:1.2:5:5:0.0,eq=saturation=1.8:contrast=1.35:brightness=0.02,vibrance=intensity=0.6",
  },
  {
    id: "noir",
    name: "Ink Noir",
    tagline: "High contrast B&W with edge ink",
    swatch: "linear-gradient(135deg,#111,#888)",
    vf: "hue=s=0,eq=contrast=1.6:brightness=-0.02,edgedetect=mode=colormix:high=0.2",
  },
  {
    id: "retro",
    name: "Retro VHS",
    tagline: "Warm grade, soft glow",
    swatch: "linear-gradient(135deg,#ff9966,#ff5e62)",
    vf: "curves=preset=vintage,eq=saturation=1.2,gblur=sigma=0.6,noise=alls=8:allf=t",
  },
];

function Studio() {
  const [file, setFile] = useState<File | null>(null);
  const [styleId, setStyleId] = useState<string>("cartoon");
  const [intensity, setIntensity] = useState(70);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [loadedFFmpeg, setLoadedFFmpeg] = useState(false);
  const ffmpegRef = useRef<any>(null);
  const inputUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => () => { if (inputUrl) URL.revokeObjectURL(inputUrl); }, [inputUrl]);
  useEffect(() => () => { if (outUrl) URL.revokeObjectURL(outUrl); }, [outUrl]);

  const ensureFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    setStatus("Loading engine (~30MB, first time only)…");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    ff.on("log", ({ message }: { message: string }) => {
      if (message.includes("time=")) {
        const m = message.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (m) setStatus(`Rendering… ${m[0].replace("time=", "")}`);
      }
    });
    ff.on("progress", ({ progress }: { progress: number }) => {
      setProgress(Math.min(99, Math.max(0, Math.round(progress * 100))));
    });
    const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ff;
    setLoadedFFmpeg(true);
    return ff;
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("video/")) {
      setFile(f);
      setOutUrl(null);
    }
  };

  const stylize = async () => {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setOutUrl(null);
    try {
      const ff = await ensureFFmpeg();
      const { fetchFile } = await import("@ffmpeg/util");
      setStatus("Loading your video…");
      const inputName = "in." + (file.name.split(".").pop() || "mp4");
      await ff.writeFile(inputName, await fetchFile(file));

      const style = STYLES.find((s) => s.id === styleId)!;
      const k = intensity / 100;
      // Blend stylized version with original by intensity using overlay+opacity trick
      const vf =
        `[0:v]split=2[orig][styl];` +
        `[styl]${style.vf}[styled];` +
        `[orig][styled]blend=all_mode=normal:all_opacity=${k.toFixed(2)},format=yuv420p`;

      setStatus("Rendering with FFmpeg.wasm…");
      await ff.exec([
        "-i", inputName,
        "-filter_complex", vf,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "26",
        "-c:a", "copy",
        "-movflags", "+faststart",
        "out.mp4",
      ]);

      setStatus("Finalizing…");
      const data = await ff.readFile("out.mp4");
      const buf = (data as Uint8Array).buffer.slice(0) as ArrayBuffer;
      const blob = new Blob([buf], { type: "video/mp4" });
      setOutUrl(URL.createObjectURL(blob));
      setProgress(100);
      setStatus("Done!");
    } catch (err: any) {
      console.error(err);
      setStatus("Error: " + (err?.message || "render failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex items-center justify-between gap-4 mb-10">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl"
            style={{ background: "conic-gradient(from 210deg, var(--pop), var(--primary), var(--accent), var(--acid), var(--pop))" }}
          />
          <div>
            <h1 className="text-2xl font-bold leading-none">Toonify Studio</h1>
            <p className="text-sm text-muted-foreground">Browser-only video stylizer · audio untouched</p>
          </div>
        </div>
        <a
          href="https://ffmpeg.org"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Powered by FFmpeg.wasm
        </a>
      </header>

      <section className="mb-8">
        <h2 className="text-5xl md:text-6xl font-bold leading-[0.95] mb-4">
          Stylize any video.
          <br />
          <span style={{
            background: "linear-gradient(120deg, var(--pop), var(--primary), var(--acid))",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          }}>Cartoon. 2D. 3D pop.</span>
        </h2>
        <p className="text-muted-foreground max-w-2xl">
          Drop your own clip, pick a look, hit render. Everything runs in your browser — your
          video never leaves your device. Audio is preserved as-is.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* LEFT: upload + preview */}
        <div className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="rounded-2xl border-2 border-dashed border-border bg-card/40 p-6"
          >
            {!file ? (
              <label className="flex flex-col items-center justify-center gap-3 py-16 cursor-pointer">
                <div className="text-6xl">🎬</div>
                <div className="text-lg font-semibold">Drop a video here</div>
                <div className="text-sm text-muted-foreground">or click to browse · MP4, MOV, WebM · keep under ~100MB for smooth render</div>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setOutUrl(null); } }}
                />
                <span className="mt-2 inline-flex items-center rounded-full px-4 py-2 text-sm font-medium bg-primary text-primary-foreground">
                  Choose file
                </span>
              </label>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-semibold truncate max-w-[20rem]">{file.name}</div>
                    <div className="text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                  <button
                    onClick={() => { setFile(null); setOutUrl(null); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Replace
                  </button>
                </div>
                {inputUrl && (
                  <video src={inputUrl} controls className="w-full rounded-xl bg-black aspect-video" />
                )}
              </div>
            )}
          </div>

          {outUrl && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Stylized output</div>
                <a
                  href={outUrl}
                  download={`toonified-${styleId}.mp4`}
                  className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold bg-accent text-accent-foreground"
                >
                  Download .mp4
                </a>
              </div>
              <video src={outUrl} controls className="w-full rounded-xl bg-black aspect-video" />
            </div>
          )}
        </div>

        {/* RIGHT: controls */}
        <div className="space-y-5">
          <div>
            <div className="text-sm uppercase tracking-widest text-muted-foreground mb-2">Style</div>
            <div className="grid grid-cols-2 gap-3">
              {STYLES.map((s) => {
                const active = s.id === styleId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setStyleId(s.id)}
                    className={`text-left rounded-xl p-3 border transition ${
                      active ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-foreground/30"
                    }`}
                  >
                    <div className="h-14 w-full rounded-lg mb-2" style={{ background: s.swatch }} />
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.tagline}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <label className="flex items-center justify-between text-sm font-medium">
              <span>Style intensity</span>
              <span className="text-muted-foreground">{intensity}%</span>
            </label>
            <input
              type="range"
              min={10}
              max={100}
              value={intensity}
              onChange={(e) => setIntensity(parseInt(e.target.value))}
              className="w-full mt-2 accent-[color:var(--primary)]"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Blends the stylized look with the original so motion stays clean.
            </p>
          </div>

          <button
            onClick={stylize}
            disabled={!file || busy}
            className="w-full rounded-xl px-5 py-4 text-lg font-bold bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition"
          >
            {busy ? "Rendering…" : loadedFFmpeg ? "Render stylized video" : "Load engine & render"}
          </button>

          {(busy || status) && (
            <div className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-muted-foreground">{status || "Idle"}</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--pop), var(--primary), var(--acid))" }}
                />
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Note:</strong> Use this on videos you own.
            FFmpeg.wasm runs fully in-browser (no server, no upload). Heavy AI-style 3D
            generation needs a GPU and is out of scope for this in-browser tool.
          </div>
        </div>
      </div>
    </main>
  );
}
