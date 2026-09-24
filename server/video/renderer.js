"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

function execAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        error.stdout = stdout;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

function buildMotionFilter(motion = "zoom_in", frames, width, height, fps) {
  switch (motion) {
    case "zoom_out":
      return `zoompan=z='max(1.15-0.0015*on,1.0)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps},format=yuv420p`;
    case "pan_up":
      return `zoompan=z='1.10':d=${frames}:x='iw/2-(iw/zoom/2)':y='max(0,(ih-ih/zoom)*(1-on/${frames}))':s=${width}x${height}:fps=${fps},format=yuv420p`;
    case "pan_down":
      return `zoompan=z='1.10':d=${frames}:x='iw/2-(iw/zoom/2)':y='min(ih-ih/zoom,(ih-ih/zoom)*(on/${frames}))':s=${width}x${height}:fps=${fps},format=yuv420p`;
    case "zoom_in":
    default:
      return `zoompan=z='min(zoom+0.0015,1.15)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps},format=yuv420p`;
  }
}

/**
 * Render a single scene into an MP4 clip with dynamic motion cuts
 */
async function renderSceneClip({
  scene = null,
  imagePath,
  audioPath,
  duration,
  outputPath,
  width = 1080,
  height = 1920,
  fps = 25
}) {
  const cleanAudio = audioPath.replace(/\\/g, "/");
  const shots = (scene?.shots && scene.shots.length > 0)
    ? scene.shots
    : [{ imagePath: imagePath || scene?.imagePath, motion: "zoom_in" }];

  if (shots.length === 1) {
    const shot = shots[0];
    const totalFrames = Math.max(25, Math.ceil(duration * fps));
    const cleanImg = shot.imagePath.replace(/\\/g, "/");
    const vf = buildMotionFilter(shot.motion || "zoom_in", totalFrames, width, height, fps);
    const args = [
      "-y",
      "-loop", "1",
      "-i", cleanImg,
      "-i", cleanAudio,
      "-vf", vf,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "21",
      "-c:a", "aac",
      "-b:a", "192k",
      "-t", String(duration),
      "-pix_fmt", "yuv420p",
      outputPath
    ];
    await execAsync("ffmpeg", args);
    return outputPath;
  }

  // Multi-shot rendering: render each visual shot, concat video, and mux narration audio
  const tempDir = path.dirname(outputPath);
  const baseName = path.basename(outputPath, ".mp4");
  const shotPaths = [];
  const shotDuration = duration / shots.length;

  for (let s = 0; s < shots.length; s++) {
    const shot = shots[s];
    const shotClipPath = path.join(tempDir, `${baseName}_cut_${s}.mp4`);
    const shotFrames = Math.max(25, Math.ceil(shotDuration * fps));
    const cleanImg = shot.imagePath.replace(/\\/g, "/");
    const vf = buildMotionFilter(shot.motion || (s % 2 === 0 ? "zoom_in" : "zoom_out"), shotFrames, width, height, fps);

    const shotArgs = [
      "-y",
      "-loop", "1",
      "-i", cleanImg,
      "-t", String(shotDuration),
      "-vf", vf,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "21",
      "-pix_fmt", "yuv420p",
      shotClipPath
    ];
    await execAsync("ffmpeg", shotArgs);
    shotPaths.push(shotClipPath);
  }

  // Concat shots with audio
  const concatFile = path.join(tempDir, `${baseName}_shots.txt`);
  fs.writeFileSync(concatFile, shotPaths.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n"), "utf8");

  await execAsync("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    "-i", cleanAudio,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", String(duration),
    "-pix_fmt", "yuv420p",
    outputPath
  ]);

  // Cleanup temporary shot clips
  for (const sp of shotPaths) {
    try { fs.unlinkSync(sp); } catch (_) {}
  }
  try { fs.unlinkSync(concatFile); } catch (_) {}

  return outputPath;
}

/**
 * Renders complete review video from synthesized scenes, BGM, and subtitles
 */
async function renderReviewVideo({
  scenes = [],
  masterSrtPath,
  outputPath,
  workDir,
  bgmPath = null,
  bgmVolume = 0.14,
  burnSubtitles = true,
  fps = 25,
  width = 1080,
  height = 1920,
  onProgress = () => {}
}) {
  if (!scenes || scenes.length === 0) {
    throw new Error("Không có phân cảnh nào để render video");
  }

  const clipsDir = path.join(workDir, "clips");
  fs.mkdirSync(clipsDir, { recursive: true });

  const clipPaths = [];
  let totalDuration = 0;

  // Step 1: Render individual scene clips
  onProgress("rendering_scenes", 10, "Đang render hiệu ứng chuyển động từng cảnh...");
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneId = scene.id || `scene_${i + 1}`;
    const clipPath = path.join(clipsDir, `${sceneId}.mp4`);
    const duration = Math.max(1.0, scene.paddedDuration || scene.duration || 5.0);
    totalDuration += duration;

    console.log(`[Renderer] Rendering clip ${i + 1}/${scenes.length} (${duration.toFixed(1)}s): ${sceneId}`);
    await renderSceneClip({
      scene,
      imagePath: scene.imagePath,
      audioPath: scene.audioPath,
      duration,
      outputPath: clipPath,
      width,
      height,
      fps
    });

    clipPaths.push(clipPath);
    const progress = 10 + Math.round(((i + 1) / scenes.length) * 45);
    onProgress("rendering_scenes", progress, `Đã hoàn thành cảnh ${i + 1}/${scenes.length}`);
  }

  // Step 2: Concatenate scene clips
  onProgress("concatenating", 60, "Đang ghép các phân cảnh video...");
  const concatListPath = path.join(workDir, "clips_concat.txt");
  const concatLines = clipPaths.map(p => `file '${p.replace(/\\/g, "/")}'`);
  fs.writeFileSync(concatListPath, concatLines.join("\n"), "utf8");

  const rawVideoPath = path.join(workDir, "raw_stitched.mp4");
  await execAsync("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
    "-c", "copy",
    rawVideoPath
  ]);

  // Step 3: Final pass with BGM mix and burned subtitles
  onProgress("mixing_and_encoding", 75, "Đang hòa âm BGM và nung phụ đề tiếng Việt...");

  const defaultBgm = path.join(__dirname, "assets/bgm-ambient.mp3");
  const activeBgm = bgmPath && fs.existsSync(bgmPath) ? bgmPath : (fs.existsSync(defaultBgm) ? defaultBgm : null);

  const finalArgs = ["-y", "-i", rawVideoPath.replace(/\\/g, "/")];

  let audioFilter = "";
  if (activeBgm) {
    finalArgs.push("-stream_loop", "-1", "-i", activeBgm.replace(/\\/g, "/"));
    const fadeOutStart = Math.max(0, totalDuration - 2.5);
    audioFilter = `[1:a]aloop=loop=-1:size=2e+09,atrim=0:${totalDuration.toFixed(2)},volume=${bgmVolume},afade=t=in:ss=0:d=1.5,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2.5[bgm];[0:a]volume=1.0[voice];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
  }

  let videoFilter = "";
  if (burnSubtitles && masterSrtPath && fs.existsSync(masterSrtPath)) {
    const relSrt = path.relative(process.cwd(), masterSrtPath).replace(/\\/g, "/");
    const isVertical = height > width;
    if (isVertical) {
      videoFilter = `subtitles=${relSrt}:force_style='FontName=Segoe UI,FontSize=16,Bold=1,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2.8,Shadow=1.4,Alignment=2,MarginV=52'`;
    } else {
      videoFilter = `subtitles=${relSrt}:force_style='FontName=Segoe UI,FontSize=15,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H99000000,BorderStyle=1,Outline=2.0,Shadow=1.0,Alignment=2,MarginV=25'`;
    }
  }

  if (activeBgm) {
    finalArgs.push("-filter_complex", audioFilter);
    finalArgs.push("-map", "0:v");
    finalArgs.push("-map", "[aout]");
  } else {
    finalArgs.push("-map", "0:v");
    finalArgs.push("-map", "0:a");
  }

  if (videoFilter) {
    finalArgs.push("-vf", videoFilter);
  }

  finalArgs.push(
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath
  );

  await execAsync("ffmpeg", finalArgs);

  onProgress("completed", 100, "Render video hoàn tất!");
  console.log(`[Renderer] Successfully rendered review video to ${outputPath} (${totalDuration.toFixed(1)}s)`);

  return {
    videoPath: outputPath,
    duration: totalDuration,
    subtitlesPath: masterSrtPath
  };
}

module.exports = {
  buildMotionFilter,
  renderSceneClip,
  renderReviewVideo
};
