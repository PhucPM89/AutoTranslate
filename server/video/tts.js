"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const VOICES = {
  FEMALE: "vi-VN-HoaiMyNeural",
  MALE: "vi-VN-NamMinhNeural"
};

/**
 * Execute child process wrapped in a Promise
 */
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

/**
 * Convert seconds to SRT timestamp format (HH:MM:SS,mmm)
 */
function secondsToSrtTime(totalSec) {
  const secNum = Math.max(0, Number(totalSec) || 0);
  const totalMs = Math.round(secNum * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;

  const pad = (n, width = 2) => String(n).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Parse timestamp (HH:MM:SS.mmm or MM:SS.mmm or HH:MM:SS,mmm) to seconds
 */
function parseTimestampToSeconds(ts) {
  if (!ts) return 0;
  const normalized = ts.trim().replace(",", ".");
  const parts = normalized.split(":");
  let sec = 0;
  if (parts.length === 3) {
    sec = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    sec = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  } else {
    sec = parseFloat(parts[0]) || 0;
  }
  return sec;
}

/**
 * Break down long cues into dynamic 4-7 word phrases for mobile readability
 */
function splitCueIfLong(cue) {
  const fullText = cue.text.join(" ").trim();
  const words = fullText.split(/\s+/);
  const duration = cue.endSec - cue.startSec;
  if (words.length >= 10 && duration >= 2.0) {
    const midWord = Math.ceil(words.length / 2);
    const midSec = cue.startSec + (duration * (midWord / words.length));
    return [
      {
        start: secondsToSrtTime(cue.startSec),
        end: secondsToSrtTime(midSec),
        startSec: cue.startSec,
        endSec: midSec,
        text: [words.slice(0, midWord).join(" ")]
      },
      {
        start: secondsToSrtTime(midSec),
        end: secondsToSrtTime(cue.endSec),
        startSec: midSec,
        endSec: cue.endSec,
        text: [words.slice(midWord).join(" ")]
      }
    ];
  }
  return [cue];
}

/**
 * Convert WebVTT/SRT content into clean SRT format with optional time offset
 */
function convertVttToSrt(rawContent, offsetSeconds = 0) {
  if (!rawContent) return "";
  const lines = rawContent.replace(/\r\n/g, "\n").split("\n");
  const srtCues = [];
  let cueIndex = 1;

  let currentCue = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("WEBVTT") || line.startsWith("NOTE")) {
      continue;
    }

    const timeMatch = line.match(/((?:\d{2}:)?\d{2}:\d{2}[,\.]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[,\.]\d{3})/);
    if (timeMatch) {
      if (currentCue && currentCue.text.length > 0) {
        srtCues.push(currentCue);
      }
      const startSec = parseTimestampToSeconds(timeMatch[1]) + offsetSeconds;
      const endSec = parseTimestampToSeconds(timeMatch[2]) + offsetSeconds;
      currentCue = {
        index: cueIndex++,
        start: secondsToSrtTime(startSec),
        end: secondsToSrtTime(endSec),
        startSec,
        endSec,
        text: []
      };
      continue;
    }

    if (currentCue) {
      // Ignore bare cue index numbers
      if (/^\d+$/.test(line)) {
        continue;
      }
      // Remove any inline WebVTT tags like <v ...> or <c>
      const cleanText = line.replace(/<\/?[^>]+(>|$)/g, "").trim();
      if (cleanText) {
        currentCue.text.push(cleanText);
      }
    }
  }

  if (currentCue && currentCue.text.length > 0) {
    srtCues.push(currentCue);
  }

  const finalCues = [];
  for (const c of srtCues) {
    finalCues.push(...splitCueIfLong(c));
  }

  return finalCues
    .map((cue, idx) => `${idx + 1}\n${cue.start} --> ${cue.end}\n${cue.text.join("\n")}\n`)
    .join("\n");
}

/**
 * Query exact duration of an audio file using ffprobe
 */
async function getAudioDurationSeconds(filePath) {
  try {
    const { stdout } = await execAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : duration;
  } catch (err) {
    console.warn(`[TTS] ffprobe duration check failed for ${filePath}:`, err.message);
    return 0;
  }
}

/**
 * Synthesize a single speech segment using edge-tts CLI
 */
async function synthesizeSegment({
  text,
  voice = VOICES.FEMALE,
  rate = "+12%",
  outputAudioPath,
  outputSubtitlePath
}) {
  if (!text || !text.trim()) {
    throw new Error("Không có nội dung văn bản để thu âm");
  }

  const cleanText = text.trim();
  const dir = path.dirname(outputAudioPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const args = [
    "--voice", voice,
    "--rate", rate,
    "--text", cleanText,
    "--write-media", outputAudioPath
  ];

  if (outputSubtitlePath) {
    args.push("--write-subtitles", outputSubtitlePath);
  }

  try {
    await execAsync("edge-tts", args, { timeout: 30000 });
  } catch (error) {
    try {
      await execAsync("python", ["-m", "edge_tts", ...args], { timeout: 30000 });
    } catch (pyError) {
      throw new Error(`Edge TTS synthesis failed: ${error.message} | ${pyError.message}`);
    }
  }

  const duration = await getAudioDurationSeconds(outputAudioPath);
  return {
    audioPath: outputAudioPath,
    subtitlePath: outputSubtitlePath,
    duration
  };
}

/**
 * Synthesize speech for all scenes in a script and generate synchronized master audio & SRT
 */
async function synthesizeScript(script, {
  workDir,
  voice = VOICES.FEMALE,
  rate = "+12%",
  scenePauseSec = 0.35
} = {}) {
  if (!script || !Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error("Kịch bản không có phân cảnh nào để thu âm");
  }

  const scenesDir = path.join(workDir, "scenes");
  if (!fs.existsSync(scenesDir)) {
    fs.mkdirSync(scenesDir, { recursive: true });
  }

  const sceneResults = [];
  let cumulativeTime = 0;
  const masterSrtChunks = [];
  const concatListLines = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const sceneId = scene.id || `scene_${i + 1}`;
    const audioPath = path.join(scenesDir, `${sceneId}.mp3`);
    const vttPath = path.join(scenesDir, `${sceneId}.vtt`);
    const srtPath = path.join(scenesDir, `${sceneId}.srt`);

    console.log(`[TTS] Synthesizing scene ${i + 1}/${script.scenes.length}: ${sceneId}`);

    const result = await synthesizeSegment({
      text: scene.text,
      voice,
      rate,
      outputAudioPath: audioPath,
      outputSubtitlePath: vttPath
    });

    let vttContent = "";
    if (fs.existsSync(vttPath)) {
      vttContent = fs.readFileSync(vttPath, "utf8");
    }

    const localSrt = convertVttToSrt(vttContent, 0);
    fs.writeFileSync(srtPath, localSrt, "utf8");

    const masterSrt = convertVttToSrt(vttContent, cumulativeTime);
    if (masterSrt.trim()) {
      masterSrtChunks.push(masterSrt.trim());
    }

    const duration = Math.max(result.duration, 1.0);
    const paddedDuration = duration + scenePauseSec;

    sceneResults.push({
      ...scene,
      audioPath,
      vttPath,
      srtPath,
      duration,
      paddedDuration,
      startTime: cumulativeTime,
      endTime: cumulativeTime + duration
    });

    concatListLines.push(`file '${audioPath.replace(/\\/g, "/")}'`);
    cumulativeTime += paddedDuration;
  }

  const masterSrtPath = path.join(workDir, "subtitles.srt");
  let cueCounter = 1;

  const allCues = [];
  for (const chunk of masterSrtChunks) {
    const blocks = chunk.split(/\n\s*\n/);
    for (const b of blocks) {
      const lines = b.trim().split("\n");
      if (lines.length >= 2) {
        const timeLine = lines.find(l => l.includes("-->"));
        if (timeLine) {
          const textLines = lines.slice(lines.indexOf(timeLine) + 1).filter(Boolean);
          allCues.push({ timeLine, text: textLines.join("\n") });
        }
      }
    }
  }

  const masterSrtContent = allCues.map(c => `${cueCounter++}\n${c.timeLine}\n${c.text}\n`).join("\n");
  fs.writeFileSync(masterSrtPath, masterSrtContent, "utf8");

  const concatFilePath = path.join(workDir, "audio_concat.txt");
  fs.writeFileSync(concatFilePath, concatListLines.join("\n"), "utf8");

  const masterAudioPath = path.join(workDir, "narration.mp3");
  await execAsync("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFilePath,
    "-c", "copy",
    masterAudioPath
  ]);

  const totalDuration = await getAudioDurationSeconds(masterAudioPath);

  return {
    masterAudioPath,
    masterSrtPath,
    totalDuration,
    scenes: sceneResults
  };
}

module.exports = {
  VOICES,
  convertVttToSrt,
  getAudioDurationSeconds,
  synthesizeSegment,
  synthesizeScript
};
