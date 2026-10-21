#!/usr/bin/env python3
"""Synthesize an original music bed + SFX for a reel, fully locally.

Reads scene durations and sfx cues from the reel's content JSON, so every
whoosh/tick lands on the exact frame of its visual reveal. No stock music,
no network, deterministic output (fixed RNG seed).

On this page the audio is Qur'an recitation: when the reel has a verified
`recitation` (scripts/sources/recitation.mjs), the per-ayah files are placed on
the timeline unchanged (one overall gain, click-free edges). Otherwise the reel
is silent. The music/SFX synthesizers below are kept but nothing selects them.
The reel's style.music picks one; otherwise the reel number rotates through
them (same rule as src/brand/theme.tsx), so consecutive reels sound different.

Usage: python3 scripts/synth-audio.py <reelId> [--music <style>]
Writes: public/audio/<reelId>-bed.wav (48 kHz, stereo, 16-bit)
"""
import json
import re
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
ROOT = Path(__file__).resolve().parent.parent


def load_reel(reel_id):
    path = ROOT / "src" / "content" / "reels" / f"{reel_id}.json"
    return json.loads(path.read_text())


def adsr(n, a, r):
    env = np.ones(n)
    a_n, r_n = int(a * SR), int(r * SR)
    if a_n:
        env[:a_n] = np.linspace(0, 1, a_n)
    if r_n:
        env[-r_n:] *= np.linspace(1, 0, r_n)
    return env


def note_hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def pad(duration):
    """Warm, slow chord pad: Am9 - Fmaj7 - Cmaj7 - G6, 4 s each."""
    chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 59, 64, 67], [55, 59, 62, 64, 71]]
    n = int(duration * SR)
    out = np.zeros(n)
    seg = 4.0
    tail = 1.4  # each chord rings into the next one: no dip at chord changes
    t_seg = np.arange(int((seg + tail) * SR)) / SR
    for k in range(int(np.ceil(duration / seg))):
        chord = chords[k % len(chords)]
        tone = np.zeros_like(t_seg)
        for m in chord:
            f = note_hz(m)
            for detune in (-0.12, 0.12):
                ff = f * 2 ** (detune / 12)
                tone += np.sin(2 * np.pi * ff * t_seg) + 0.25 * np.sin(2 * np.pi * 2 * ff * t_seg)
        tone *= adsr(len(t_seg), 0.6, tail + 0.4)
        start = int(k * seg * SR)
        end = min(n, start + len(tone))
        out[start:end] += tone[: end - start]
    sos = butter(2, 1800, "low", fs=SR, output="sos")
    out = sosfilt(sos, out)
    return out / (np.max(np.abs(out)) + 1e-9)


def pulse(duration, bpm=100, start=2.9):
    """Soft sub pulse on the beat + very quiet filtered hat on offbeats."""
    n = int(duration * SR)
    out = np.zeros(n)
    beat = 60 / bpm
    kick_t = np.arange(int(0.18 * SR)) / SR
    kick = np.sin(2 * np.pi * (55 + 60 * np.exp(-kick_t * 30)) * kick_t) * np.exp(-kick_t * 18)
    rng = np.random.default_rng(7)
    hat = rng.standard_normal(int(0.05 * SR)) * np.exp(-np.arange(int(0.05 * SR)) / SR * 90)
    hat = sosfilt(butter(2, 7000, "high", fs=SR, output="sos"), hat)
    t = start
    i = 0
    while t < duration - 1.0:
        s = int(t * SR)
        e = min(n, s + len(kick))
        out[s:e] += kick[: e - s] * 0.9
        hs = int((t + beat / 2) * SR)
        he = min(n, hs + len(hat))
        if hs < n:
            out[hs:he] += hat[: he - hs] * 0.18
        t += beat
        i += 1
    return out


def sfx(kind):
    rng = np.random.default_rng({"whoosh": 1, "tick": 2, "chime": 3, "low": 4, "impact": 5}[kind])
    if kind == "whoosh":
        d = 0.38
        n = int(d * SR)
        noise = rng.standard_normal(n)
        # Rising band-pass sweep built from short filtered blocks.
        out = np.zeros(n)
        blocks = 12
        for b in range(blocks):
            s, e = b * n // blocks, (b + 1) * n // blocks
            fc = 500 + 3500 * (b / blocks)
            sos = butter(2, [fc * 0.7, fc * 1.3], "band", fs=SR, output="sos")
            out[s:e] = sosfilt(sos, noise[s:e])
        env = np.sin(np.linspace(0, np.pi, n)) ** 2
        return out * env * 2.2
    if kind == "tick":
        d = 0.06
        t = np.arange(int(d * SR)) / SR
        return np.sin(2 * np.pi * 1760 * t) * np.exp(-t * 70) * 0.55
    if kind == "chime":
        d = 0.9
        t = np.arange(int(d * SR)) / SR
        return (np.sin(2 * np.pi * 880 * t) + 0.6 * np.sin(2 * np.pi * 1318.5 * t)) * np.exp(-t * 4.5) * 0.45
    if kind == "low":
        d = 0.5
        t = np.arange(int(d * SR)) / SR
        f = 220 * (0.75 ** (t / d))
        phase = 2 * np.pi * np.cumsum(f) / SR
        return np.sin(phase) * np.exp(-t * 5) * 0.6
    if kind == "impact":
        d = 0.35
        t = np.arange(int(d * SR)) / SR
        thump = np.sin(2 * np.pi * (48 + 40 * np.exp(-t * 25)) * t) * np.exp(-t * 11)
        noise = sosfilt(butter(2, 1200, "low", fs=SR, output="sos"), rng.standard_normal(len(t))) * np.exp(-t * 30) * 0.4
        return (thump + noise) * 0.9
    raise ValueError(kind)


# ----------------------------------------------------------------- instruments
RNG = np.random.default_rng(11)


def _place(out, clip, t, gain=1.0):
    s = int(t * SR)
    if s >= len(out) or s < 0:
        return
    e = min(len(out), s + len(clip))
    out[s:e] += clip[: e - s] * gain


def lowpass(x, fc, order=2):
    return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)


def highpass(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


def kick(punch=1.0, d=0.32):
    t = np.arange(int(d * SR)) / SR
    f = 48 + 90 * punch * np.exp(-t * 35)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    click = highpass(RNG.standard_normal(len(t)), 2000) * np.exp(-t * 250) * 0.15
    return body + click


def snare(tone=180, noise=0.8, d=0.22):
    t = np.arange(int(d * SR)) / SR
    body = np.sin(2 * np.pi * tone * t) * np.exp(-t * 28) * 0.5
    nz = sosfilt(butter(2, [1500, 7000], "band", fs=SR, output="sos"), RNG.standard_normal(len(t))) * np.exp(-t * 18) * noise
    return body + nz


def clap(d=0.25):
    t = np.arange(int(d * SR)) / SR
    env = np.zeros(len(t))
    for k, off in enumerate((0, 0.011, 0.022)):
        env += np.exp(-np.maximum(t - off, 0) * (180 if k < 2 else 22)) * (t >= off)
    return sosfilt(butter(2, [900, 5000], "band", fs=SR, output="sos"), RNG.standard_normal(len(t))) * env * 0.8


def hat(open_=False):
    d = 0.22 if open_ else 0.05
    t = np.arange(int(d * SR)) / SR
    return highpass(RNG.standard_normal(len(t)), 7500) * np.exp(-t * (14 if open_ else 90))


def tom(f0=90, d=0.6):
    t = np.arange(int(d * SR)) / SR
    f = f0 * (1 + 0.6 * np.exp(-t * 18))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5) + lowpass(RNG.standard_normal(len(t)), 900) * np.exp(-t * 30) * 0.3


def saw(f, t, harmonics=12):
    out = np.zeros_like(t)
    for h in range(1, harmonics + 1):
        if f * h > SR / 2.2:
            break
        out += np.sin(2 * np.pi * f * h * t) / h
    return out


def square(f, t, harmonics=9):
    out = np.zeros_like(t)
    for h in range(1, 2 * harmonics, 2):
        if f * h > SR / 2.2:
            break
        out += np.sin(2 * np.pi * f * h * t) / h
    return out


def bass_note(midi, d, kind="sine"):
    t = np.arange(int(d * SR)) / SR
    f = note_hz(midi)
    if kind == "saw":
        x = lowpass(saw(f, t, 8), 900)
    elif kind == "square":
        x = lowpass(square(f, t, 5), 1400)
    else:
        x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    return x * adsr(len(t), 0.005, min(0.06, d / 3))


def epiano(chord, d):
    t = np.arange(int(d * SR)) / SR
    x = np.zeros_like(t)
    for m in chord:
        f = note_hz(m)
        x += (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 6)) * np.exp(-t * 1.6)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)
    return x * trem * adsr(len(t), 0.004, 0.2)


def pluck(midi, d, kind="square"):
    t = np.arange(int(d * SR)) / SR
    f = note_hz(midi)
    x = square(f, t, 6) if kind == "square" else saw(f, t, 8)
    return lowpass(x, 3500) * np.exp(-t * 9) * adsr(len(t), 0.002, 0.02)


def strings(chord, d, bright=1200):
    t = np.arange(int(d * SR)) / SR
    x = np.zeros_like(t)
    for m in chord:
        for det in (-0.08, 0.08):
            x += saw(note_hz(m) * 2 ** (det / 12), t, 10)
    x = lowpass(x, bright)
    return x * adsr(len(t), min(1.2, d / 3), min(1.0, d / 3))


def chord_track(duration, chords, bar, make):
    out = np.zeros(int(duration * SR))
    k = 0
    t = 0.0
    while t < duration:
        _place(out, make(chords[k % len(chords)], bar), t)
        t += bar
        k += 1
    return out


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


def drums(duration, bpm, start, pattern, swing=0.5):
    """pattern: dict of name -> list of 16th-step indices (0–15) per bar."""
    out = np.zeros(int(duration * SR))
    sixteenth = 60 / bpm / 4
    bar = sixteenth * 16
    kit = {"kick": kick(), "snare": snare(), "clap": clap(), "hat": hat(), "open": hat(True), "tom": tom(), "low": tom(60, 0.9)}
    gains = {"kick": 1.0, "snare": 0.55, "clap": 0.55, "hat": 0.22, "open": 0.18, "tom": 0.7, "low": 0.9}
    t0 = start
    while t0 < duration - 0.8:
        for name, steps in pattern.items():
            for st in steps:
                off = st * sixteenth
                if st % 2 == 1:
                    off += (swing - 0.5) * 2 * sixteenth
                _place(out, kit[name], t0 + off, gains[name])
        t0 += bar
    return out


def first_downbeat(bpm, after):
    beat = 60 / bpm
    return np.ceil(after / beat) * beat


# ----------------------------------------------------------------- styles
def style_glow(duration):
    return pad(duration) * 0.30 + pulse(duration) * 0.22


def style_drive(duration):
    bpm = 122
    beat = 60 / bpm
    bar = beat * 4
    start = first_downbeat(bpm, 0.9)
    prog = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]  # Dm Bb F C
    bass = np.zeros(int(duration * SR))
    t, k = start, 0
    while t < duration - 0.5:
        root = prog[(k // 8) % 4][0] - 12
        _place(bass, bass_note(root + (12 if k % 2 else 0), beat / 2 * 0.9, "saw"), t)
        t += beat / 2
        k += 1
    stabs = chord_track(duration, [[m + 12 for m in c] for c in prog], bar, lambda c, d: strings(c, d, 2400) * adsr(int(d * SR), 0.01, d * 0.6))
    beat_ = drums(duration, bpm, start, {"kick": [0, 4, 8, 12], "clap": [4, 12], "hat": [2, 6, 10, 14], "open": [14]})
    return norm(bass) * 0.30 + norm(stabs) * 0.14 + norm(beat_) * 0.42


def style_lofi(duration):
    bpm = 84
    bar = 60 / bpm * 4
    start = first_downbeat(bpm, 0.4)
    prog = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]  # Fmaj7 Em7 Dm7 Cmaj7
    keys = chord_track(duration, prog, bar, epiano)
    bass = chord_track(duration, prog, bar, lambda c, d: bass_note(c[0] - 12, d * 0.9))
    beat_ = drums(duration, bpm, start, {"kick": [0, 7, 10], "snare": [4, 12], "hat": [0, 2, 4, 6, 8, 10, 12, 14]}, swing=0.6)
    beat_ = lowpass(beat_, 6000)
    crackle = np.zeros(int(duration * SR))
    for _ in range(int(duration * 9)):
        _place(crackle, highpass(RNG.standard_normal(60), 3000) * np.hanning(60), RNG.uniform(0, duration), RNG.uniform(0.2, 1))
    hiss = lowpass(RNG.standard_normal(int(duration * SR)), 5000) * 0.02
    return norm(keys) * 0.34 + norm(bass) * 0.22 + norm(beat_) * 0.34 + crackle * 0.03 + hiss * 0.4


def style_arcade(duration):
    bpm = 112
    sixteenth = 60 / bpm / 4
    bar = sixteenth * 16
    start = first_downbeat(bpm, 0.5)
    prog = [[64, 67, 71], [60, 64, 67], [67, 71, 74], [62, 66, 69]]  # Em C G D
    arp = np.zeros(int(duration * SR))
    t, k = start, 0
    order = [0, 1, 2, 1, 0, 2, 1, 2]
    while t < duration - 0.5:
        chord = prog[int((t - start) // bar) % 4]
        note = chord[order[k % len(order)]] + (12 if (k // 8) % 2 else 0)
        _place(arp, pluck(note, sixteenth * 0.95), t)
        t += sixteenth
        k += 1
    bass = chord_track(duration, prog, bar, lambda c, d: np.concatenate([bass_note(c[0] - 24, d / 4, "square") for _ in range(4)]))
    bass = np.concatenate([np.zeros(int(start * SR)), bass])[: int(duration * SR)]
    beat_ = drums(duration, bpm, start, {"kick": [0, 6, 8], "snare": [4, 12], "hat": [2, 6, 10, 14]})
    return norm(arp) * 0.26 + norm(bass) * 0.24 + norm(beat_) * 0.38


def style_cinematic(duration):
    bpm = 90
    bar = 60 / bpm * 4
    prog = [[48, 55, 60, 63], [44, 51, 56, 60], [46, 53, 58, 62], [43, 50, 55, 59]]  # Cm Ab Bb G
    pads = chord_track(duration, prog, bar * 2, lambda c, d: strings(c, d, 900))
    t = np.arange(int(duration * SR)) / SR
    drone = lowpass(saw(note_hz(36), t, 10), 300) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.1 * t))
    start = first_downbeat(bpm, 2.6)
    beat_ = drums(duration, bpm, start, {"low": [0, 10], "tom": [8, 14], "hat": [4, 12]})
    boom = np.zeros(len(t))
    _place(boom, tom(48, 1.6), 0.02, 1.0)
    _place(boom, tom(48, 1.6), start, 0.8)
    return norm(pads) * 0.30 + norm(drone) * 0.18 + norm(beat_) * 0.34 + norm(boom) * 0.30


STYLES = {"glow": style_glow, "drive": style_drive, "lofi": style_lofi, "arcade": style_arcade, "cinematic": style_cinematic}


def pick_music(reel):
    """Same rule as pickStyle() in src/brand/theme.tsx."""
    styles = json.loads((ROOT / "src" / "brand" / "styles.json").read_text())
    names = list(styles["music"].keys())
    chosen = (reel.get("style") or {}).get("music")
    if chosen in names:
        return chosen
    m = re.match(r"^deen-(\d+)", reel["id"])
    if m:
        n = int(m.group(1))
    else:
        n = 0
        for ch in reel["id"]:
            n = (n * 31 + ord(ch)) & 0xFFFFFFFF
    return names[(n + 2) % len(names)]


def limiter(x, ceiling_db=-2.5, release_s=0.08, look_s=0.005):
    """Peak limiter with short look-ahead window and smoothed release."""
    ceiling = 10 ** (ceiling_db / 20)
    level = np.max(np.abs(x), axis=1)
    win = max(1, int(look_s * SR))
    # Look-ahead: running max over the next `win` samples.
    padded = np.concatenate([level, np.zeros(win)])
    ahead = np.lib.stride_tricks.sliding_window_view(padded, win + 1).max(axis=1)[: len(level)]
    target = np.minimum(1.0, ceiling / np.maximum(ahead, 1e-9))
    # Instant attack, exponential release (implemented as a one-pole on 1-gain).
    alpha = np.exp(-1.0 / (release_s * SR))
    reduction = sosfilt(np.array([[1 - alpha, 0, 0, 1, -alpha, 0]]), 1 - target)
    gain = np.minimum(target, 1 - np.minimum(reduction, 1 - target))
    return x * gain[:, None]


def master(stereo, target_rms_db=-19.0):
    """Bring the mix to a consistent loudness, then limit peaks (no clipping)."""
    rms = np.sqrt(np.mean(stereo ** 2))
    stereo = stereo * (10 ** (target_rms_db / 20) / (rms + 1e-12))
    stereo = limiter(stereo)
    return np.clip(stereo, -0.999, 0.999)


def decode(path):
    """Any audio file → float32 stereo at SR (via ffmpeg)."""
    import subprocess
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def recitation_track(rec, n):
    """Place the verified per-ayah recitation files on the timeline, unchanged
    except for one overall gain: no effects, no music, nothing mixed under it.
    The pipeline sized the reel so the last ayah ends before the video does."""
    import os
    cache = Path(os.environ.get("DEEN_RECITATION_DIR") or (ROOT / ".cache" / "recitations"))
    out = np.zeros((n, 2))
    t = int(round(rec["startFrame"] / 30 * SR))
    active = []
    for f in rec["files"]:
        clip = decode(cache / rec["folder"] / f["file"])
        end = min(n, t + len(clip))
        if end - t < len(clip):
            raise SystemExit(f"recitation {f['file']} would be cut at the end of the reel; re-run the sources apply step")
        out[t:end] += clip[: end - t]
        active.append((t, end))
        t = end + int(rec.get("gapSec", 0.25) * SR)
    # Loudness: match the voiced part to ~-18 dBFS RMS, then a gentle peak limiter.
    voiced = np.concatenate([out[a:b] for a, b in active])
    level = np.abs(voiced).max(axis=1)
    voiced = voiced[level > 10 ** (-45 / 20)] if np.any(level > 10 ** (-45 / 20)) else voiced
    rms = np.sqrt(np.mean(voiced ** 2)) + 1e-12
    out *= 10 ** (-18 / 20) / rms
    # 15 ms fades at each clip edge only, to avoid clicks (never inside an ayah).
    k = int(0.015 * SR)
    for a, b in active:
        out[a:a + k] *= np.linspace(0, 1, k)[:, None]
        out[b - k:b] *= np.linspace(1, 0, k)[:, None]
    return np.clip(limiter(out, ceiling_db=-1.5), -0.999, 0.999)


def write_wav(reel_id, stereo):
    out = ROOT / "public" / "audio" / f"{reel_id}-bed.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    pcm = (stereo * 32767).astype(np.int16)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    reel_id = sys.argv[1]
    reel = load_reel(reel_id)
    fps = reel["fps"]
    total_frames = sum(s["durationInFrames"] for s in reel["scenes"])
    duration = total_frames / fps
    n = int(round(duration * SR))

    rec = reel.get("recitation") or {}
    if rec.get("files") and not rec.get("off"):
        stereo = recitation_track(rec, n)
        write_wav(reel_id, stereo)
        print(f"Wrote public/audio/{reel_id}-bed.wav ({duration:.2f}s, recitation {rec['citation']} by {rec['reciterName']}, {rec['totalSec']}s from {rec['startFrame'] / fps:.2f}s)")
        return
    music_style = sys.argv[sys.argv.index("--music") + 1] if "--music" in sys.argv else pick_music(reel)
    if music_style == "none":
        # Silent reel: no music and no sound effects. A silent stereo AAC track is
        # still muxed so every player and the Instagram API see a normal file.
        write_wav(reel_id, np.zeros((n, 2)))
        print(f"Wrote public/audio/{reel_id}-bed.wav ({duration:.2f}s, silent: no music, no SFX)")
        return
    music = STYLES[music_style](duration)
    music = np.concatenate([music, np.zeros(max(0, n - len(music)))])[:n]
    # Fade the bed in quickly and out over the last 1.2 s.
    music *= adsr(n, 0.25, 1.2)

    fx = np.zeros(n)
    start = 0
    cues = []
    for scene in reel["scenes"]:
        for cue in scene.get("sfx", []):
            t = (start + cue["at"]) / fps
            s = int(t * SR)
            clip = sfx(cue["kind"])
            e = min(n, s + len(clip))
            if s < n:
                fx[s:e] += clip[: e - s]
                cues.append((round(t, 3), cue["kind"]))
        start += scene["durationInFrames"]

    # Duck the music slightly under each SFX for clarity.
    duck = np.ones(n)
    for t, _ in cues:
        s = int(t * SR)
        e = min(n, s + int(0.25 * SR))
        duck[s:e] = np.minimum(duck[s:e], 0.8)
    mix_mono = music * duck + fx * 0.5

    # Gentle stereo width: tiny delay on the right channel for the bed only.
    delay = int(0.012 * SR)
    right_bed = np.concatenate([np.zeros(delay), (music * duck)[:-delay]])
    left = mix_mono
    right = right_bed + fx * 0.5

    stereo = np.stack([left, right], axis=1)
    stereo = master(stereo)

    out = write_wav(reel_id, stereo)
    print(f"Wrote {out.relative_to(ROOT)} ({duration:.2f}s, music: {music_style}, {len(cues)} SFX cues)")


if __name__ == "__main__":
    main()
