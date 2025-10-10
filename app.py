import os
import sys
import random
import base64
import time
import socket
import subprocess
from io import BytesIO
from pathlib import Path
import secrets
from flask import (
    Flask, render_template, request, jsonify, send_from_directory,
    session, redirect, url_for, send_file, render_template_string, make_response
)
from werkzeug.utils import secure_filename
from flask_cors import CORS

from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageOps, ImageFilter
import dropbox
import requests
from bs4 import BeautifulSoup
import io

# Google Drive
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# Try to be gentle with threads for heavy libs
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

# ─── Path Configuration ─────────────────────────────
if getattr(sys, 'frozen', False):
    exe_dir       = os.path.dirname(sys.executable)
    IMAGE_FOLDER  = os.path.join(exe_dir, 'slitoex', 'images')
    OUTPUT_FOLDER = os.path.join(exe_dir, 'slitoex', 'slides')
    MEGA_FOLDER   = os.path.join(exe_dir, 'slitoex', 'mega_slides')
    CORPUS_FILE   = os.path.join(exe_dir, 'slitoex', 'corpus.txt')
    bundle_dir    = sys._MEIPASS  # type: ignore[attr-defined]
    TEMPLATES_DIR = os.path.join(bundle_dir, 'templates')
    STATIC_DIR    = os.path.join(bundle_dir, 'static')
else:
    base_dir      = os.path.dirname(os.path.abspath(__file__))
    exe_dir       = base_dir
    IMAGE_FOLDER  = os.path.join(base_dir, 'images')
    OUTPUT_FOLDER = os.path.join(base_dir, 'slides')
    MEGA_FOLDER   = os.path.join(base_dir, 'mega_slides')
    CORPUS_FILE   = os.path.join(base_dir, 'corpus.txt')
    TEMPLATES_DIR = os.path.join(base_dir, 'templates')
    STATIC_DIR    = os.path.join(base_dir, 'static')

# Audio splitting I/O
AUDIO_INPUT   = os.path.join(exe_dir, 'slitoex', 'audio_input')
STEMS_OUTPUT  = os.path.join(exe_dir, 'slitoex', 'stems')

for d in (IMAGE_FOLDER, OUTPUT_FOLDER, MEGA_FOLDER, AUDIO_INPUT, STEMS_OUTPUT):
    os.makedirs(d, exist_ok=True)

DROPBOX_APP_KEY = 'k9qtvznx5g7g0yr'
DROPBOX_TOKEN   = os.environ.get('DROPBOX_TOKEN', '')

# Google Drive OAuth
SCOPES = ['https://www.googleapis.com/auth/drive.file']
CLIENT_SECRETS_FILE = os.environ.get('GDRIVE_CLIENT_SECRETS', 'client_secret.json')

# Image compression knobs (smaller files + lower client RAM)
IMAGE_MAX_EDGE = int(os.environ.get('SLITOEX_MAX_EDGE', '2048'))  # clamp long edge
WEBP_QUALITY   = int(os.environ.get('SLITOEX_WEBP_Q', '82'))      # 60–90 good range

# Captioning helpers
SECOND_TEMPLATES = [
    # originals
    "But {artist} just flipped the script",
    "Enter {artist}, the game-changer",
    "Now watch {artist} light up every beat",
    "Don’t miss {artist} breaking the mold",
    "Here comes {artist} with the antidote",
    "No one expected {artist} to change the game",
    "That’s when {artist} stepped in",
    "Suddenly, {artist} rewrites the rules",
    "It only took {artist} to spark a revolution",
    "{artist} doesn’t follow trends — but creates them",
    "{artist} brought the storm the scene needed",
    "Now the spotlight belongs to {artist}",
    "Then everything changed — thanks to {artist}",
    "{artist} didn’t wait for a seat at the table",
    "Brace yourself — {artist} just arrived",
    "Here’s where {artist} redefines the sound",
    "Now {artist} is all anyone talks about",
    "They didn’t see {artist} coming",
    "Time for {artist} to take the mic",
    "The wait is over — {artist} is here",
    "From silence to roar — that’s {artist}",
    "{artist} didn’t knock, they kicked the door in",
    "See {artist}, the artist that is unstoppable",
    "{artist} made the scene impossible to ignore",
    "Get ready — {artist} is rewriting everything",

    # new adds
    "{artist} walked in and raised the ceiling",
    "{artist} tuned the chaos into an anthem",
    "Clear the stage — {artist} has something to say",
    "Every rule bent once {artist} pressed play",
    "All roads lead to {artist} right now",
    "This is where {artist} turns sparks into wildfires",
    "{artist} just took the wheel",
    "The timeline belongs to {artist} today",
    "New chapter unlocked by {artist}",
    "{artist} didn’t ask — they claimed it",
    "The volume shifts when {artist} breathes on a beat",
    "Make room — {artist} is moving the crowd",
    "You’ll remember where you were when {artist} dropped",
    "{artist} just painted outside every line",
    "Whole scene tilts when {artist} leans in",
    "The blueprint? {artist} threw it out",
    "{artist} is the plot twist you didn’t see",
    "Same stage, new era — {artist}",
    "Heads up — {artist} just pressed fast-forward",
    "{artist} turned whispers into war drums",
    "Stand back — {artist} is testing limits",
    "Spotlight finds {artist} every single time",
    "Say less — {artist} let the record talk",
    "Trends chase {artist}, not the other way",
    "The silence broke the second {artist} arrived",
    "{artist} turned a spark into daylight",
    "Different energy when {artist} walks in",
    "{artist} didn’t join the wave — they made one",
    "Keep your eyes open — {artist} is cooking",
    "Another door opens when {artist} pushes",
    "This is the frequency {artist} broadcasts on",
    "{artist} changes the room temperature",
    "The chorus hits harder with {artist} on it",
    "Watch the metrics run to {artist}",
    "You felt that shift? That was {artist}",
    "{artist} wrote the headline mid-verse",
    "Noise turns into signal around {artist}",
    "The echo you hear is {artist} arriving",
    "Take note — {artist} draws the map now",
    "When the beat hesitates, {artist} decides",
    "{artist} plugged the city straight into the board",
    "Old rules fade when {artist} speaks up",
    "The baseline moves like {artist} planned it",
    "{artist} doesn’t chase moments — they mint them",
    "Whole feed wakes up when {artist} posts",
    "The bridge just burned — {artist} built a runway",
    "Call it what you want — {artist} calls it Tuesday",
    "The air gets louder when {artist} exhales",
    "{artist} cut through the static like lightning",
    "No script survives first contact with {artist}",
    "The crowd didn’t blink — {artist} froze time",
    "Roads curve to meet {artist}",
    "{artist} took a breath and the beat obeyed",
    "History just bookmarked {artist}",
    "Gravity relaxes when {artist} dances",
    "Every loop bends toward {artist}",
    "That ripple? {artist} threw the stone",
    "{artist} turned the backstage into a launch pad",
    "The metronome follows {artist} now",
    "This is what the rumor was about — {artist}",
    "City lights flicker when {artist} plugs in",
    "The ceiling cracked — {artist} raised it again",
    "Facts only: {artist} delivers pressure and relief",
    "The hook won’t leave because {artist} owns it",
    "New coordinates: wherever {artist} stands",
    "{artist} rewired the chorus mid-flight",
    "The crowd remembered how to breathe — {artist}",
    "Crossfade to the moment {artist} arrives",
    "Numbers spike, pulses rise — {artist}",
    "If the beat is a door, {artist} is the key",
    "Every echo spells the same name: {artist}",
    "Whole mood resets when {artist} smiles",
    "The night reroutes around {artist}",
    "This is not hype — it’s {artist}",
    "Proof of life for the scene: {artist}",
    "{artist} speaks in cymbals and sirens",
    "The afterglow belongs to {artist}",
    "Clocks skip when {artist} cuts in",
    "No pause — {artist} hit continue",
    "Stage lights blink like they know {artist}",
    "Angles change — {artist} found a new frame",
    "Feet move before minds catch up — {artist}",
    "From hush to roar, guided by {artist}",
    "The chorus leaned forward for {artist}",
    "Minutes turn cinematic around {artist}",
    "The room didn’t get louder — {artist} did",
    "New north found — {artist} points the needle",
    "Your favorite’s favorite? {artist}",
    "This is the part where {artist} takes over"
]

STYLE_KEYWORDS = {
    'provocation': [
        'disappointment','weak','predictable','copy','boredom','letdown','emotionless','forgettable',
        'pitiful','white noise','insult','uninspired','stale','generic','dry','tired','repetitive',
        'noise','asleep','outdated','muffled','none','flat','graveyard','lazy','flop','fail',
        'unoriginal','boring','soulless','regurgitated','limps','limp','dull','drain','forgettable','void'
    ],
    'rescue': [
        'saved','refreshing','reviving','breathing','rescue','antidote','pulls','proof','defibrillator',
        'light','revival','healing','comeback','restores','lifts','hope','revives','safety','CPR','calm',
        'poetry','supportive','restorative','resilient','remarkable','soothing','uplifting','compassion',
        'repairs','comfort','parachute','empathetic','therapy','grace','spark','ignite','awaken','elevate'
    ],
    'ad': [
        'stream','click','play','listen','download','favorite','repeat','hooked','obsess','anthem','hit',
        'dopamine','buzz','viral','promised','add','reel','share','motion','confidence','clicks','brand',
        'market','product','placement','licensed','promotion','commercial','hype','playlist','vibe','fuel'
    ],
    'news': [
        'breaking','latest','announced','debut','buzzing','headline','fresh','new','updated','newsflash',
        'premiere','hot','dropped','surfaced','chart-topper','release','released','just released',
        'first','impact','begin','arrived','highlight','announcement','launch','mic','timeline','airwaves'
    ]
}

app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)
CORS(app)
app.secret_key = os.environ.get('FLASK_SECRET_KEY') or os.urandom(24)

# Let env override these; defaults to subfolders in the project
CORPORA_DIR = os.environ.get('CORPORA_DIR', os.path.join(exe_dir, 'corpora'))
SECOND_PHRASES_FILE = os.environ.get('SECOND_PHRASES_FILE', os.path.join(exe_dir, 'second_phrases.txt'))

# Normalize CORPORA_DIR to absolute (avoid double-join bugs)
if not os.path.isabs(CORPORA_DIR):
    CORPORA_DIR = os.path.join(exe_dir, CORPORA_DIR)
os.makedirs(CORPORA_DIR, exist_ok=True)

# ─── Utilities ─────────────────────────────────────

def _cache_headers(resp, secs=3600):
    resp.cache_control.public = True
    resp.cache_control.max_age = secs
    return resp

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()

# Image utilities for smaller RAM/disk
def _resize_fit(img: Image.Image, max_edge=IMAGE_MAX_EDGE) -> Image.Image:
    w, h = img.size
    long_edge = max(w, h)
    if long_edge <= max_edge:
        return img
    scale = max_edge / float(long_edge)
    tw, th = int(round(w*scale)), int(round(h*scale))
    return img.resize((tw, th), Image.LANCZOS)

def _to_webp_dataurl(img: Image.Image, quality=WEBP_QUALITY) -> str:
    buf = BytesIO()
    img.save(buf, format='WEBP', quality=int(quality), method=4)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()

def _ensure_webp_filename(fn: str) -> str:
    base, _ = os.path.splitext(fn)
    return base + '.webp'

# Let env override where corpora live (so "copora" works)
def _load_corpus(style=None):
    """
    If CORPORA_DIR exists, use it. Otherwise fall back to slitoex/corpora,
    and finally ./copora for legacy setups.
    """
    if os.path.isdir(CORPORA_DIR):
        corpus_folder = CORPORA_DIR
    else:
        corpus_folder = os.path.join(exe_dir, 'slitoex', 'corpora')  # original
        if not os.path.isdir(corpus_folder):
            corpus_folder = os.path.join(exe_dir, 'copora')  # legacy fallback

    os.makedirs(corpus_folder, exist_ok=True)

    if style is None:
        all_lines = []
        for fn in os.listdir(corpus_folder):
            if fn.endswith('.txt'):
                with open(os.path.join(corpus_folder, fn), 'r', encoding='utf-8') as f:
                    all_lines.extend([line.strip() for line in f if line.strip()])
        return all_lines

    fpath = os.path.join(corpus_folder, f"{style}.txt")
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            return [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        return None

def _draw_slide(img_path, caption, out_path):
    img = Image.open(img_path).convert('RGB')
    img = _resize_fit(img, max_edge=IMAGE_MAX_EDGE)  # clamp
    draw = ImageDraw.Draw(img)
    fs = max(20, img.height // 12)
    try:
        font = ImageFont.truetype('arial.ttf', fs)
    except IOError:
        font = ImageFont.load_default()
    tw, th = draw.textsize(caption, font=font)
    x = (img.width - tw) // 2
    y = img.height - th - int(img.height * 0.06)
    pad = fs // 4
    try:
        draw.rectangle([x-pad, y-pad, x+tw+pad, y+th+pad], fill=(0,0,0,150))
    except Exception:
        draw.rectangle([x-pad, y-pad, x+tw+pad, y+th+pad], fill=(0,0,0))
    draw.text((x, y), caption, font=font, fill=(255,255,255))
    # save compact
    out_path = _ensure_webp_filename(out_path)
    img.save(out_path, format='WEBP', quality=WEBP_QUALITY, method=4)

# ─── Demucs helpers ────────────────────────────────

def run_demucs(input_path: str, mode: str = '2stem') -> Path:
    """Run Demucs on input_path. Returns directory that contains stems."""
    input_path = Path(input_path)
    out_root = Path(STEMS_OUTPUT)
    out_root.mkdir(parents=True, exist_ok=True)

    cmd = [sys.executable, '-m', 'demucs', '-o', str(out_root)]
    if mode == '2stem':
        cmd += ['--two-stems', 'vocals']
    elif mode == '4stem':
        pass
    else:
        mode = '2stem'
        cmd += ['--two-stems', 'vocals']
    cmd.append(str(input_path))

    print('[DEMUCS] Running:', ' '.join(cmd))
    env = os.environ.copy()
    env.setdefault('OMP_NUM_THREADS', '1')
    subprocess.run(cmd, check=True, env=env)

    # Demucs writes: STEMS_OUTPUT/<model>/<track_name>/
    candidates = list(out_root.glob('*/*'))
    matching = [d for d in candidates if d.is_dir() and input_path.stem.lower() in d.name.lower()]
    dirs = matching or candidates
    if not dirs:
        raise RuntimeError('Demucs output directory not found')
    newest = max(dirs, key=lambda p: p.stat().st_mtime)
    return newest

def collect_stems(stem_dir: Path) -> dict:
    files = list(Path(stem_dir).glob('*.wav'))
    rel = {}
    for f in files:
        name = f.stem.lower()
        disp = 'accompaniment' if name == 'no_vocals' else name
        rel[disp] = str(f.relative_to(STEMS_OUTPUT)).replace('\\', '/')
    return rel

def pick_vocals_stem(stem_dir: Path):
    """Prefer true vocal stems, never 'no_vocals'."""
    names_exact = {'vocals', 'lead_vocals', 'vocal', 'vox'}
    for f in Path(stem_dir).glob('*.wav'):
        stem = f.stem.lower()
        if stem in names_exact or stem.endswith('- vocals'):
            return str(f)
    return None

def pick_instrumental_2stem(stem_dir: Path):
    """For 2-stem demucs: prefer 'no_vocals' / 'accompaniment' / 'instrumental'."""
    prefer = ['no_vocals', 'accompaniment', 'instrumental']
    files = list(Path(stem_dir).glob('*.wav'))
    for name in prefer:
        for f in files:
            if f.stem.lower() == name:
                return str(f)
    for f in files:
        if 'no_vocals' in f.stem.lower():
            return str(f)
    return None

# ─── Remix & Analysis DSP helpers ─────────────────
from tempfile import TemporaryDirectory
import uuid
import numpy as np, soundfile as sf, librosa
import shutil

# Optional time-stretch/pitch-shift: pyrubberband (needs Rubber Band CLI on PATH)
try:
    import pyrubberband as pyrb
    HAVE_RB = bool(shutil.which("rubberband")) or bool(os.environ.get("PYRUBBERBAND_PATH"))
except Exception:
    HAVE_RB = False

# Optional madmom for robust tempo (if installed)
try:
    from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
    HAVE_MADMOM = True
except Exception:
    HAVE_MADMOM = False

MAJ = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
MIN = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
NAMES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']

def _tempo_madmom(y, sr):
    if not HAVE_MADMOM:
        return 0.0
    try:
        with TemporaryDirectory() as td:
            path = os.path.join(td, 'tmp.wav')
            sf.write(path, y.astype(np.float32), sr)
            act = RNNBeatProcessor()(path)
            beats = DBNBeatTrackingProcessor(fps=100)(act)
            if len(beats) >= 2:
                itv = np.diff(beats)
                itv = itv[itv > 0]
                if itv.size:
                    bpm = 60.0 / float(np.median(itv))
                    while bpm > 180.0: bpm /= 2.0
                    while 0.0 < bpm < 70.0: bpm *= 2.0
                    return float(bpm)
    except Exception as e:
        print("madmom tempo failed:", e)
    return 0.0

def _tempo(y, sr):
    y = np.asarray(y, dtype=np.float32)
    if y.ndim > 1:
        y = np.mean(y, axis=1)
    y = librosa.util.normalize(y)

    bpm_mm = _tempo_madmom(y, sr)
    if bpm_mm > 0:
        return bpm_mm

    try:
        y_p = librosa.effects.percussive(y)
        y_h = librosa.effects.harmonic(y)
        pick = y_p if np.std(y_p) >= 0.6*np.std(y_h) else y_h
    except Exception:
        pick = y

    hop = 512
    oenv = librosa.onset.onset_strength(y=pick, sr=sr, hop_length=hop)
    if oenv.size < 24:
        return 0.0

    win_frames = int((15.0 * sr) / hop)
    bpms = []
    for start in range(0, len(oenv), win_frames):
        seg = oenv[start:start+win_frames]
        if len(seg) < 24:
            break
        cand = librosa.beat.tempo(onset_envelope=seg, sr=sr, hop_length=hop, aggregate=None)
        if cand is not None and len(cand) > 0:
            bpms.append(float(cand[0]))
    if not bpms:
        cand = librosa.beat.tempo(onset_envelope=oenv, sr=sr, hop_length=hop, aggregate=None)
        if cand is None or len(cand) == 0:
            return 0.0
        bpms = [float(cand[0])]

    bpm = float(np.median(bpms))
    while bpm > 180.0: bpm /= 2.0
    while 0.0 < bpm < 70.0: bpm *= 2.0
    return bpm

def _key(y, sr):
    y = np.asarray(y, dtype=np.float32)
    if y.ndim > 1:
        y = np.mean(y, axis=1)
    y = librosa.util.normalize(y)
    try:
        y_h = librosa.effects.harmonic(y)
    except Exception:
        y_h = y
    try:
        tune = float(librosa.estimate_tuning(y=y_h, sr=sr))
    except Exception:
        tune = 0.0
    chroma = librosa.feature.chroma_cqt(y=y_h, sr=sr, tuning=tune, norm=None)
    chroma = librosa.decompose.nn_filter(chroma, aggregate=np.median, metric='cosine')
    chroma = chroma / (np.sum(chroma, axis=0, keepdims=True) + 1e-9)
    chroma_mean = np.median(chroma, axis=1)
    best_mode, best_tonic, best_score = 'maj', 0, -1e9
    for tonic in range(12):
        smaj = float(np.dot(chroma_mean, np.roll(MAJ, tonic)))
        if smaj > best_score:
            best_mode, best_tonic, best_score = 'maj', tonic, smaj
        smin = float(np.dot(chroma_mean, np.roll(MIN, tonic)))
        if smin > best_score:
            best_mode, best_tonic, best_score = 'min', tonic, smin
    name = f"{NAMES[best_tonic]} {'major' if best_mode == 'maj' else 'minor'}"
    return name, int(best_tonic), (best_mode == 'maj')

def _semi(src_tonic, src_major, tgt_tonic, tgt_major):
    d = (tgt_tonic - src_tonic) % 12
    if d > 6: d -= 12
    if src_major != tgt_major and abs(d) > 3:
        if src_major and tgt_tonic == (src_tonic+9)%12: d = -3
        if (not src_major) and tgt_tonic == (src_tonic+3)%12: d = 3
    return float(d)

def _tstretch(y, sr, rate):
    if not np.isfinite(rate) or rate <= 0:
        rate = 1.0
    if HAVE_RB:
        try:
            return pyrb.time_stretch(y, sr, rate)
        except Exception as e:
            print("Rubber Band failed, falling back to librosa:", e)
    return librosa.effects.time_stretch(y=y, rate=rate)

def _pshift(y, sr, semit):
    if HAVE_RB:
        try:
            return pyrb.pitch_shift(y, sr, semit)
        except Exception as e:
            print("Rubber Band failed, falling back to librosa:", e)
    return librosa.effects.pitch_shift(y=y, sr=sr, n_steps=semit)

def _first_strong_onset_time(y, sr, hop=512, max_seek_s=45.0):
    y = np.asarray(y)
    yt, _ = librosa.effects.trim(y, top_db=30)
    if len(yt) < sr*0.5:
        yt = y
    yt = yt[:int(sr*max_seek_s)]
    if len(yt) < hop*4:
        return 0.0
    oenv = librosa.onset.onset_strength(y=yt, sr=sr, hop_length=hop)
    if oenv.size < 16:
        return 0.0
    mu, sd = float(np.mean(oenv)), float(np.std(oenv) + 1e-8)
    z = (oenv - mu) / sd
    frames = np.where(z > 2.2)[0]
    if frames.size == 0:
        idx = int(np.argmax(z))
    else:
        min_start = int(np.ceil(0.2 * sr / hop))
        candidates = frames[frames >= min_start]
        idx = int(candidates[0]) if candidates.size else int(frames[0])
    t = librosa.frames_to_time(idx, sr=sr, hop_length=hop)
    return float(max(0.0, t))

def _beat_times(y, sr, hop=512, start_bpm=None):
    try:
        _, y_p = librosa.effects.hpss(y, margin=(1.0, 3.0))
    except Exception:
        y_p = y
    oenv = librosa.onset.onset_strength(y=y_p, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop,
                                           start_bpm=start_bpm or 120.0, units='frames')
    times = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    return float(tempo), times

from PIL import Image, ImageFilter as _ImageFilter  # alias to avoid confusion

@app.post('/api/upscale4k')
def upscale4k():
    data = request.json or {}
    data_url = data.get('dataUrl')
    if not data_url or ',' not in data_url:
        return jsonify({'error':'dataUrl required'}), 400

    try:
        _, b64 = data_url.split(',', 1)
        src = Image.open(BytesIO(base64.b64decode(b64))).convert('RGB')

        w, h = src.size
        long_edge = max(w, h)
        target_long = 3840
        if long_edge < target_long:
            scale = target_long / float(long_edge)
            tw, th = int(round(w*scale)), int(round(h*scale))
            img = src.resize((tw, th), Image.LANCZOS)
        else:
            img = src

        img = img.filter(_ImageFilter.UnsharpMask(radius=2.4, percent=160, threshold=3))
        img = img.filter(_ImageFilter.UnsharpMask(radius=0.8, percent=80, threshold=0))

        out = _to_webp_dataurl(img, quality=max(80, WEBP_QUALITY))
        return jsonify({'dataUrl': out})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _align_simple(v, i, sr):
    hop=512
    seg = int(min(len(v), len(i), int(90*sr)))
    ov = librosa.onset.onset_strength(y=v[:seg], sr=sr, hop_length=hop)
    oi = librosa.onset.onset_strength(y=i[:seg], sr=sr, hop_length=hop)
    L  = max(len(ov), len(oi))
    if L < 24:
        vv = v
        return vv[:len(i)] if len(vv)>len(i) else np.pad(vv,(0,len(i)-len(vv)))
    ov = np.pad(ov,(0,L-len(ov))); oi = np.pad(oi,(0,L-len(oi)))
    lag = np.argmax(np.correlate(ov-ov.mean(), oi-oi.mean(), mode='full')) - (len(ov)-1)
    offset = int(lag*hop)
    if offset>=0: vv = np.pad(v,(offset,0))
    else:         vv = v[-offset:]
    vv = vv[:len(i)] if len(vv)>len(i) else np.pad(vv,(0,len(i)-len(vv)))
    return vv

def _align_smart(v, i, sr):
    hop = 512
    MAX_ANALYZE_S = 90.0
    v_an = v[:int(sr*MAX_ANALYZE_S)]
    i_an = i[:int(sr*MAX_ANALYZE_S)]
    ti, bt_i = _beat_times(i_an, sr, hop=hop)
    if bt_i.size < 4:
        return _align_simple(v, i, sr)
    _, _ = _beat_times(v_an, sr, hop=hop, start_bpm=ti)
    t_v0 = _first_strong_onset_time(v_an, sr, hop=hop, max_seek_s=45.0)
    beat_dur = 60.0 / (ti if ti > 1e-6 else 120.0)
    early_window_s = min(MAX_ANALYZE_S, 32 * beat_dur)
    anchors = bt_i[bt_i <= early_window_s]
    if anchors.size == 0:
        anchors = bt_i[:8]
    candidates = []
    for b in anchors:
        candidates.extend([b, b + 0.5*beat_dur, b - 0.5*beat_dur, b + 1.0*beat_dur, b - 1.0*beat_dur])
    uniq = []
    seen = set()
    for c in candidates:
        k = round(c, 3)
        if k not in seen and -5.0 <= c <= MAX_ANALYZE_S:
            uniq.append(c); seen.add(k)
    candidates = uniq if uniq else [0.0]

    def apply_offset(offset_s):
        shift = int(round((offset_s - t_v0) * sr))
        if shift >= 0: vv = np.pad(v, (shift, 0))
        else:          vv = v[-shift:]
        if len(vv) > len(i): vv = vv[:len(i)]
        elif len(vv) < len(i): vv = np.pad(vv, (0, len(i)-len(vv)))
        return vv

    def score(vv):
        dur = min(MAX_ANALYZE_S, len(i)/sr)
        ov = librosa.onset.onset_strength(y=vv[:int(sr*dur)], sr=sr, hop_length=hop)
        oi = librosa.onset.onset_strength(y=i [:int(sr*dur)], sr=sr, hop_length=hop)
        L = min(len(ov), len(oi))
        if L < 24: return -1.0
        c = float(np.corrcoef((ov - ov.mean())/(ov.std()+1e-8),
                              (oi - oi.mean())/(oi.std()+1e-8))[0,1])
        return c

    best_v, best_s, best_off = None, -9.0, None
    for b in candidates:
        vv = apply_offset(b)
        s  = score(vv)
        early_penalty = 0.002 * max(0.0, b)
        s -= early_penalty
        if np.isfinite(s) and s > best_s:
            best_s, best_v, best_off = s, vv, b

    try:
        print(f"[ALIGN] vocal_first_onset={t_v0:.3f}s  inst_anchor={best_off:.3f}s  score={best_s:.3f}")
    except Exception:
        pass

    return best_v if best_v is not None else apply_offset(0.0)

def _rms(x):
    x = np.asarray(x)
    return float(np.sqrt(np.mean(np.square(x))) + 1e-12)

def _match_levels(v_al, i, target_diff_db=-6.0, cap_gain=8.0):
    rv = _rms(v_al)
    ri = _rms(i[:len(v_al)])
    if rv <= 1e-9 or ri <= 1e-9:
        return v_al
    desired = (ri/rv) * (10.0**(target_diff_db/20.0))
    desired = float(np.clip(desired, 0.5, cap_gain))
    return v_al * desired

def make_remix(vocal_path, instrumental_path, out_path):
    v, sr_v = librosa.load(vocal_path, sr=None, mono=True)
    i, sr_i = librosa.load(instrumental_path, sr=None, mono=True)
    sr = 44100
    if sr_v != sr:
        v = librosa.resample(y=v, orig_sr=sr_v, target_sr=sr)
    if sr_i != sr:
        i = librosa.resample(y=i, orig_sr=sr_i, target_sr=sr)

    t_v = _tempo(v, sr); key_v, tv, mv = _key(v, sr)
    t_i = _tempo(i, sr); key_i, ti, mi = _key(i, sr)

    if t_v > 0 and t_i > 0:
        applied_rate = float(np.clip(t_i / t_v, 0.5, 2.0))
    else:
        applied_rate = 1.0
    v2 = _tstretch(v, sr, applied_rate)

    semi = _semi(tv, mv, ti, mi)
    semi = float(np.clip(semi, -6.0, 6.0))
    v3 = _pshift(v2, sr, semi)

    v_al = _align_smart(v3, i, sr)
    v_bal = _match_levels(v_al, i, target_diff_db=-6.0)

    mix = (0.92 * i[:len(v_bal)]) + (1.00 * v_bal)
    peak = float(np.max(np.abs(mix)) + 1e-12)
    if peak > 1.0:
        mix = mix / peak

    sf.write(out_path, mix, sr)
    return {
        "vocal_bpm": float(t_v), "inst_bpm": float(t_i),
        "vocal_key": key_v, "inst_key": key_i,
        "semitones": float(semi),
        "applied_time_stretch": float(applied_rate),
        "sr": sr, "out": out_path
    }

# ─── Robust short snippet loader ─────────────────────────
def _load_snippet(path, sr=44100, offset=0.2, duration=30.0):
    """
    Decode a short mono snippet reliably (fast).
    Order: FFmpeg → soundfile → librosa. Return (y, sr).
    """
    try:
        if shutil.which("ffmpeg"):
            cmd = [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-ss", str(offset), "-t", str(duration),
                "-i", path, "-ac", "1", "-ar", str(sr), "-f", "wav", "-"
            ]
            p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            data, _ = sf.read(BytesIO(p.stdout), dtype="float32", always_2d=False)
            if getattr(data, "ndim", 1) > 1:
                data = data.mean(axis=1)
            return data.astype(np.float32), sr
    except Exception as e:
        print("[_load_snippet] ffmpeg decode failed →", repr(e))

    try:
        y, rate = sf.read(path, dtype="float32", always_2d=False)
        if rate != sr:
            y = librosa.resample(y=y, orig_sr=rate, target_sr=sr)
        if getattr(y, "ndim", 1) > 1:
            y = y.mean(axis=1)
        start = int(offset * sr)
        end   = start + int(duration * sr)
        y = y[start:end]
        return y.astype(np.float32), sr
    except Exception as e:
        print("[_load_snippet] soundfile read failed →", repr(e))

    try:
        y, rate = librosa.load(path, sr=sr, mono=True, offset=offset, duration=duration)
        return y.astype(np.float32), rate
    except Exception as e:
        print("[_load_snippet] librosa load failed →", repr(e))
        return np.zeros(int(duration*sr), dtype=np.float32), sr

# ─── Improved BPM helpers ─────────────────────────
def _fold_bpm(bpm, lo=70.0, hi=180.0):
    if not np.isfinite(bpm) or bpm <= 0:
        return 0.0
    while bpm > hi: bpm /= 2.0
    while bpm < lo: bpm *= 2.0
    return float(bpm)

def _local_maxima(x):
    if len(x) < 3:
        return np.array([], dtype=int)
    return np.where((x[1:-1] > x[:-2]) & (x[1:-1] > x[2:]))[0] + 1

def _parabolic_refine(y, x0):
    if x0 <= 0 or x0 >= len(y)-1:
        return float(x0), float(y[x0])
    y_m1, y_0, y_p1 = float(y[x0-1]), float(y[x0]), float(y[x0+1])
    denom = (y_m1 - 2.0*y_0 + y_p1)
    if abs(denom) < 1e-12:
        return float(x0), y_0
    delta = 0.5 * (y_m1 - y_p1) / denom
    x_ref = float(x0) + np.clip(delta, -0.5, 0.5)
    y_ref = y_0 - 0.25 * (y_m1 - y_p1) * delta
    return x_ref, float(y_ref)

def _autocorr_bpm_candidates(oenv, sr, hop, lo_bpm=40.0, hi_bpm=220.0, top_k=8):
    x = oenv.astype(np.float32)
    x = (x - x.mean()) / (x.std() + 1e-8)
    max_lag = int(round(8.0 * sr / hop))
    ac = librosa.autocorrelate(x, max_size=max_lag)
    ac[0] = 0.0
    lags = np.arange(1, len(ac))
    bpms = 60.0 * sr / (lags * hop)
    m = min(len(lags), len(bpms), len(ac))
    lags, bpms, ac = lags[:m], bpms[:m], ac[:m]
    mask = (bpms >= lo_bpm) & (bpms <= hi_bpm)
    if not np.any(mask):
        return []
    lags, bpms, ac = lags[mask], bpms[mask], ac[mask]
    peak_ids = _local_maxima(ac)
    if peak_ids.size == 0:
        peak_ids = np.array([int(np.argmax(ac))], dtype=int)
    C = []
    for pid in peak_ids[:top_k*2]:
        lag0 = int(pid)
        lag_ref, mag_ref = _parabolic_refine(ac, lag0)
        bpm = 60.0 * sr / (lag_ref * hop)
        C.append((float(bpm), float(mag_ref)))
    C.sort(key=lambda t: t[1], reverse=True)
    return C[:top_k]

def _periodogram_bpm_candidates(oenv, sr, hop, lo_bpm=40.0, hi_bpm=220.0, top_k=6):
    x = oenv.astype(np.float32)
    x = (x - x.mean())
    if np.max(np.abs(x)) > 0:
        x = x / np.max(np.abs(x))
    win = np.hanning(len(x)).astype(np.float32)
    xw = x * win
    X = np.fft.rfft(xw)
    mag = np.abs(X)
    fs_env = float(sr) / float(hop)
    freqs = np.fft.rfftfreq(len(xw), d=1.0/fs_env)
    bpms = 60.0 * freqs
    mask = (bpms >= lo_bpm) & (bpms <= hi_bpm)
    if not np.any(mask):
        return []
    mag = mag[mask]
    bpms = bpms[mask]
    peak_ids = _local_maxima(mag)
    if peak_ids.size == 0:
        peak_ids = np.array([int(np.argmax(mag))])
    C = []
    for pid in peak_ids:
        k0 = int(pid)
        k_ref, m_ref = _parabolic_refine(mag, k0)
        k0i = int(np.clip(k_ref, 0, len(bpms)-1))
        bpm = float(bpms[k0i])
        C.append((bpm, float(m_ref)))
    C.sort(key=lambda t: t[1], reverse=True)
    return C[:top_k]

def _tempo_detail(y, sr, hop=256, band=(70.0, 180.0)):
    y = np.asarray(y, dtype=np.float32)
    if y.ndim > 1:
        y = y.mean(axis=1)
    y = librosa.util.normalize(y)
    lo, hi = band
    def fold(b): return _fold_bpm(b, lo, hi)

    try:
        _, y_p = librosa.effects.hpss(y, margin=(1.0, 3.0))
    except Exception:
        y_p = y

    oenv = librosa.onset.onset_strength(y=y_p, sr=sr, hop_length=hop)
    if oenv.size < 24 or np.max(oenv) < 1e-6:
        return {"bpm": 0.0, "alt_half": 0.0, "alt_double": 0.0, "confidence": 0.0, "method": "insufficient", "candidates": []}

    candidates = []
    method = "fusion"

    bpm_mm = _tempo_madmom(y, sr)
    if bpm_mm > 0:
        candidates.append((fold(bpm_mm), 2.0, "madmom"))
        method = "madmom+fusion"

    ac_cands = _autocorr_bpm_candidates(oenv, sr, hop, lo_bpm=40.0, hi_bpm=220.0, top_k=8)
    if ac_cands:
        ac_mag_max = max([c[1] for c in ac_cands]) + 1e-9
        for bpm, s in ac_cands:
            candidates.append((fold(bpm), 1.0 + 0.8*(s/ac_mag_max), "autocorr"))

    sp_cands = _periodogram_bpm_candidates(oenv, sr, hop, lo_bpm=40.0, hi_bpm=220.0, top_k=6)
    if sp_cands:
        sp_mag_max = max([c[1] for c in sp_cands]) + 1e-9
        for bpm, s in sp_cands:
            candidates.append((fold(bpm), 1.15 + 0.7*(s/sp_mag_max), "periodogram"))

    try:
        tempo_bt, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop, units='time')
        if np.isfinite(tempo_bt) and tempo_bt > 0:
            candidates.append((fold(float(tempo_bt)), 1.05, "beat_track"))
        if beats is not None and len(beats) >= 2:
            ibi = np.diff(beats)
            ibi = ibi[ibi > 0]
            if ibi.size:
                bpm_ibi = 60.0 / float(np.median(ibi))
                candidates.append((fold(bpm_ibi), 1.05, "ibi_median"))
    except Exception:
        pass

    if not candidates:
        return {"bpm": 0.0, "alt_half": 0.0, "alt_double": 0.0, "confidence": 0.0, "method": "none", "candidates": []}

    bins = {}
    for bpm_f, w, src in candidates:
        key = round(bpm_f * 2.0) / 2.0
        if key not in bins:
            bins[key] = {"score": 0.0, "hits": 0, "sources": set(), "bpms": []}
        bins[key]["score"] += float(w)
        bins[key]["hits"]  += 1
        bins[key]["sources"].add(src)
        bins[key]["bpms"].append(bpm_f)

    ranked = sorted(bins.items(), key=lambda kv: (kv[1]["score"], len(kv[1]["sources"]), kv[1]["hits"]), reverse=True)
    top_key, meta = ranked[0]
    best_bpm = float(np.median(meta["bpms"]))

    if len(ranked) > 1:
        s1 = ranked[0][1]["score"]; s2 = ranked[1][1]["score"]
        confidence = float(np.clip((s1 - s2) / (s1 + 1e-9), 0.05, 0.99))
    else:
        confidence = 0.7

    alt_half   = _fold_bpm(best_bpm / 2.0, lo, hi)
    alt_double = _fold_bpm(best_bpm * 2.0, lo, hi)
    uniq = sorted({round(k, 2) for k in bins.keys()})

    return {
        "bpm": float(round(best_bpm, 2)),
        "alt_half": float(round(alt_half, 2)),
        "alt_double": float(round(alt_double, 2)),
        "confidence": confidence,
        "method": method,
        "candidates": uniq
    }

# ─── API: BPM-only analyzer (single route; never 500) ────────────────────
@app.post("/api/analyze")
def api_analyze():
    import traceback
    DEFAULT_BPM = 120.0

    try:
        f = request.files.get("file")
        if not f or not f.filename:
            return jsonify({
                "bpm": DEFAULT_BPM,
                "confidence": 0.0,
                "alt_bpms": [],
                "key": "Unknown",
                "note": "no file"
            }), 200

        with TemporaryDirectory() as td:
            path = os.path.join(td, secure_filename(f.filename or "audio"))
            f.save(path)
            y, sr = _load_snippet(path, sr=44100, offset=0.2, duration=30.0)

        if y is None or len(y) < 4096 or float(np.max(np.abs(y)) + 1e-12) < 1e-4:
            return jsonify({
                "bpm": DEFAULT_BPM,
                "confidence": 0.0,
                "alt_bpms": [],
                "key": "Unknown",
                "note": "silent or unreadable audio"
            }), 200

        detail = _tempo_detail(y, sr, hop=256, band=(70.0, 180.0))
        bpm = detail.get("bpm", 0.0)
        if not np.isfinite(bpm) or bpm <= 0:
            bpm = float(_tempo(y, sr))
            if not np.isfinite(bpm) or bpm <= 0:
                bpm = DEFAULT_BPM
            confidence = 0.25
            alt_bpms = []
        else:
            confidence = float(detail.get("confidence", 0.0))
            alt_bpms = []
            if detail.get("alt_half"):
                half = float(detail["alt_half"])
                if abs(half - bpm) > 1.0:
                    alt_bpms.append(round(half, 2))
            if detail.get("alt_double"):
                doub = float(detail["alt_double"])
                if abs(doub - bpm) > 1.0:
                    alt_bpms.append(round(doub, 2))

        return jsonify({
            "bpm": round(float(bpm), 2),
            "confidence": confidence,
            "alt_bpms": alt_bpms,
            "key": "Unknown"
        }), 200

    except Exception as e:
        print("[/api/analyze] FATAL:", e)
        traceback.print_exc()
        return jsonify({
            "bpm": DEFAULT_BPM,
            "confidence": 0.0,
            "alt_bpms": [],
            "key": "Unknown",
            "note": f"degraded: {type(e).__name__}"
        }), 200

# ─── Routes ───────────────────────────────────────

@app.route('/')
def index():
    resp = make_response(render_template('index.html', dropbox_app_key=DROPBOX_APP_KEY))
    return _cache_headers(resp)

@app.route('/remixo')
def remixo():
    return render_template('remixo.html')

@app.route('/journal')
def journal():
    return render_template('journal.html')

@app.post('/api/remixo')
def api_remixo():
    return api_remix()

@app.route('/payout')
def payout():
    return render_template('payout.html')

@app.route('/item')
def item():
    return render_template('item.html')

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/lyrics')
def lyrics():
    return render_template('lyrics.html')

@app.route('/nichepack')
def nichepack():
    return render_template('nichepack.html')

@app.route('/marketplace')
def marketplace():
    return render_template('marketplace.html')

@app.route('/upload')
def upload():
    return render_template('upload.html')

@app.route('/api/lyrics/genius')
def genius_lyrics():
    artist = request.args.get('artist','').strip()
    title  = request.args.get('title','').strip()
    if not artist or not title:
        return jsonify({'error':'artist & title required'}), 400
    q = f"{artist} {title}"
    search = requests.get('https://genius.com/api/search/multi',
                          params={'q': q}, timeout=8).json()
    url = None
    for s in search['response']['sections']:
        if s['type']=='song':
            hits = s['hits']
            if hits:
                url = hits[0]['result']['url']
                break
    if not url:
        return jsonify({'error':'No Genius match'}), 404
    page = requests.get(url, timeout=8)
    soup = BeautifulSoup(page.text, 'html.parser')
    lyrics_divs = soup.select('div[data-lyrics-container]')
    if not lyrics_divs:
        return jsonify({'error':'Lyrics block not found'}), 404
    lyrics = "\n".join(div.get_text(separator='\n').strip() for div in lyrics_divs)
    return jsonify({'lyrics': lyrics})

@app.post("/api/remix")
def api_remix():
    """
    Form fields:
      songA: file (use vocals from this)
      songB: file (use instrumental from this)
      mode: 2stem|4stem (default 2stem)
    """
    if "songA" not in request.files or "songB" not in request.files:
        return jsonify({"ok": False, "error": "songA and songB required"}), 400

    mode = request.form.get("mode", "2stem")
    with TemporaryDirectory() as td:
        a_in = os.path.join(td, secure_filename(request.files["songA"].filename or "a.wav"))
        b_in = os.path.join(td, secure_filename(request.files["songB"].filename or "b.wav"))
        request.files["songA"].save(a_in)
        request.files["songB"].save(b_in)

        # Split with Demucs
        try:
            a_dir = run_demucs(a_in, mode=mode)
            b_dir = run_demucs(b_in, mode=mode)
        except Exception as e:
            return jsonify({"ok": False, "error": f"Demucs failed. Make sure `pip install demucs` and ffmpeg are installed. Details: {e}"}), 500

        # Pick stems (STRICT A=vocals; B=instrumental)
        a_voc = pick_vocals_stem(Path(a_dir))
        if mode == "4stem":
            b_inst = pick_instrumental_2stem(Path(b_dir))
            if not b_inst:
                try:
                    stems = {}
                    for name in ('bass','drums','other'):
                        p = Path(b_dir) / f'{name}.wav'
                        if p.exists():
                            y, sr = librosa.load(str(p), sr=None, mono=True)
                            stems[name] = (y, sr)
                    if not stems:
                        return jsonify({"ok": False, "error": "Could not build instrumental from 4 stems"}), 500
                    L = max(len(y) for y,_ in stems.values())
                    parts = []
                    sr = list(stems.values())[0][1]
                    for y,_ in stems.values():
                        parts.append(np.pad(y, (0, L-len(y))))
                    mix = np.sum(parts, axis=0)
                    peak = float(np.max(np.abs(mix)) + 1e-9)
                    if peak > 1.0: mix /= peak
                    b_inst = os.path.join(td,'inst_mix.wav')
                    sf.write(b_inst, mix, sr)
                except Exception as e:
                    return jsonify({"ok": False, "error": f"Failed to build 4-stem instrumental: {e}"}), 500
        else:
            b_inst = pick_instrumental_2stem(Path(b_dir))

        if not a_voc or not b_inst:
            return jsonify({"ok": False, "error": "could not find correct stems"}), 500

        print("A vocals:", a_voc)
        print("B instrumental:", b_inst)

        # Remix
        out_name = f"remix_{uuid.uuid4().hex[:8]}.wav"
        out_path = os.path.join(OUTPUT_FOLDER, out_name)
        meta = make_remix(a_voc, b_inst, out_path)

    base = request.host_url.rstrip("/")
    return jsonify({
        "ok": True,
        "preview": f"{base}/share/{out_name}",
        "meta": meta
    })

@app.route('/api/images')
def list_images():
    gid = session.get('gid', '')
    files = sorted(
        fn for fn in os.listdir(IMAGE_FOLDER)
        if fn.lower().endswith(('.png','jpg','jpeg','gif','webp','mp4','webm','mov','ogg'))
        and (fn in INITIAL_PUBLIC_IMAGES or fn.startswith(gid + '__'))
    )
    return jsonify(files)




@app.before_request
def ensure_gid():
    if 'gid' not in session:
        session['gid'] = secrets.token_urlsafe(8)
        
@app.route('/images/<path:filename>')
def serve_image(filename):
    gid = session.get('gid', '')
    if filename not in INITIAL_PUBLIC_IMAGES and not filename.startswith(gid + '__'):
        return ('Forbidden', 403)
    return send_from_directory(IMAGE_FOLDER, filename)



INITIAL_PUBLIC_IMAGES = set(
    fn for fn in os.listdir(IMAGE_FOLDER)
    if fn.lower().endswith(('.png','jpg','jpeg','gif','webp','mp4','webm','mov','ogg'))
)


@app.route('/upload-image', methods=['POST'])
def upload_image():
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error':'No file part'}), 400

    gid = session.get('gid')  # NEW
    base, ext = os.path.splitext(secure_filename(file.filename))
    # Prefix with session gid
    fn = f"{gid}__{base}{ext}"
    dest = os.path.join(IMAGE_FOLDER, fn)

    i = 1
    while os.path.exists(dest):
        fn = f"{gid}__{base}_{i}{ext}"  # keep the gid prefix
        dest = os.path.join(IMAGE_FOLDER, fn)
        i += 1

    file.save(dest)

    # (optional but helpful) remember ownership
    owned = set(session.get('owned_images', []))
    owned.add(fn)
    session['owned_images'] = list(owned)
    session.modified = True

    return jsonify({'success': True, 'filename': fn})



@app.route('/images/<path:filename>')
def serve_image(filename):
    resp = make_response(send_from_directory(IMAGE_FOLDER, filename))
    return _cache_headers(resp, secs=86400)

@app.route('/api/generate', methods=['POST'])
def generate_captions():
    data   = request.json or {}
    artist = data.get('artist','').strip()
    style  = data.get('style','')
    lines  = _load_corpus(style)
    if lines is None:
        return jsonify({'error':f'Missing corpus for style {style}'}), 400
    cap1 = random.choice(lines)
    cap2 = random.choice(SECOND_TEMPLATES).format(artist=artist)
    return jsonify({'caption1':cap1,'caption2':cap2})

@app.route('/upload-second', methods=['POST'])
def upload_second():
    file = request.files.get('file')
    if not file or not file.filename.endswith('.txt'):
        return jsonify({'success': False, 'error': 'Only .txt files allowed'}), 400
    file.save(SECOND_PHRASES_FILE)
    return jsonify({'success': True})

@app.route('/api/second_line', methods=['POST'])
def api_second_line():
    data = request.json or {}
    mode = data.get('second_mode', 'classic').lower()
    artist = data.get('artist', '').strip()
    if mode == 'custom':
        if not os.path.exists(SECOND_PHRASES_FILE):
            return jsonify({'line': ''})
        with open(SECOND_PHRASES_FILE, 'r', encoding='utf-8') as f:
            lines = [l.strip() for l in f if l.strip()]
    else:
        lines = SECOND_TEMPLATES
    if not lines:
        return jsonify({'line': ''})
    line = random.choice(lines)
    return jsonify({'line': line.format(artist=artist)})

@app.route('/api/mega_generate', methods=['POST'])
def mega_generate():
    data   = request.json or {}
    artist = data.get('artist', '').strip()
    if not artist:
        return jsonify({'error': 'Artist required'}), 400

    imgs = [fn for fn in os.listdir(IMAGE_FOLDER)
            if fn.lower().endswith(('.webp','png', 'jpg', 'jpeg'))]
    if len(imgs) < 2:
        return jsonify({'error': 'Need at least 2 images'}), 400

    styles = list(STYLE_KEYWORDS.keys())
    runs = []
    for _ in range(10):
        st = random.choice(styles)
        lines = _load_corpus(st)
        if not lines:
            continue
        i1, i2 = random.sample(imgs, 2)
        cap1 = random.choice(lines)
        cap2 = random.choice(SECOND_TEMPLATES).format(artist=artist)
        runs.append({'image1': i1, 'image2': i2, 'caption1': cap1, 'caption2': cap2, 'style': st})

    if not runs:
        return jsonify({'error': 'No captions found for any style'}), 400

    return jsonify({'runs': runs})

@app.route('/api/save_dropbox', methods=['POST'])
def save_dropbox():
    if not DROPBOX_TOKEN:
        return jsonify({'error':'No Dropbox token configured'}), 400
    data     = request.json or {}
    filename = data.get('filename')
    data_url = data.get('dataUrl')
    if not filename or not data_url:
        return jsonify({'error':'filename and dataUrl required'}), 400
    try:
        _, b64 = data_url.split(',',1)
        binary = base64.b64decode(b64)
        dbx    = dropbox.Dropbox(DROPBOX_TOKEN)
        dest   = f'/slides/{filename}'
        dbx.files_upload(binary, dest, mode=dropbox.files.WriteMode.overwrite)
        return jsonify({'path':dest})
    except Exception as e:
        return jsonify({'error':str(e)}), 500

# Google Drive OAuth routes -------------------------------------------------

@app.route('/gdrive-login')
def gdrive_login():
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri=url_for('gdrive_oauth2callback', _external=True)
    )
    auth_url, _ = flow.authorization_url(prompt='consent')
    return redirect(auth_url)

@app.route('/oauth2callback')
def gdrive_oauth2callback():
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri=url_for('gdrive_oauth2callback', _external=True)
    )
    flow.fetch_token(authorization_response=request.url)
    creds = flow.credentials
    session['gdrive_creds'] = {
        'token': creds.token,
        'refresh_token': creds.refresh_token,
        'token_uri': creds.token_uri,
        'client_id': creds.client_id,
        'client_secret': creds.client_secret,
        'scopes': creds.scopes
    }
    return redirect('/')

def get_gdrive_creds():
    if 'gdrive_creds' not in session:
        return None
    return Credentials(**session['gdrive_creds'])

@app.route('/api/save_gdrive', methods=['POST'])
def save_gdrive():
    creds = get_gdrive_creds()
    if not creds:
        return jsonify({'error': 'Not authenticated. Please <a href="/gdrive-login">log in with Google</a>.'}), 401
    data = request.json or {}
    filename = data.get('filename')
    data_url = data.get('dataUrl')
    if not filename or not data_url:
        return jsonify({'error': 'filename and dataUrl required'}), 400
    try:
        _, b64 = data_url.split(',', 1)
        binary = base64.b64decode(b64)
        file_metadata = {'name': filename}
        media = MediaIoBaseUpload(io.BytesIO(binary), mimetype='image/webp')
        drive = build('drive', 'v3', credentials=creds)
        file = drive.files().create(body=file_metadata, media_body=media, fields='id,webViewLink').execute()
        return jsonify({'success': True, 'id': file['id'], 'link': file['webViewLink']})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# Share & static pages ------------------------------------------------------

@app.route('/share/')
def share_index():
    files = sorted(fn for fn in os.listdir(OUTPUT_FOLDER)
                   if fn.lower().endswith(('.webp', '.png', '.jpg', '.jpeg', '.wav', '.mp3')))
    return render_template('share.html', files=files)

@app.route('/remix')
def remix():
    return render_template('remix.html')

@app.route('/share/<filename>')
def share_file(filename):
    resp = make_response(send_from_directory(OUTPUT_FOLDER, filename))
    return _cache_headers(resp, secs=86400)

@app.route('/api/corpora')
def list_corpora():
    corpus_folder = CORPORA_DIR
    if not os.path.isdir(corpus_folder):
        corpus_folder = os.path.join(exe_dir, 'slitoex', 'corpora')
        if not os.path.isdir(corpus_folder):
            corpus_folder = os.path.join(exe_dir, 'copora')
    os.makedirs(corpus_folder, exist_ok=True)

    styles = []
    for fn in os.listdir(corpus_folder):
        if fn.endswith('.txt'):
            styles.append(os.path.splitext(fn)[0])
    styles.sort()
    return jsonify(styles)

@app.route('/mega_slides/<path:filename>')
def serve_mega(filename):
    resp = make_response(send_from_directory(MEGA_FOLDER, filename))
    return _cache_headers(resp, secs=86400)

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(STATIC_DIR, 'favicon.ico', mimetype='image/vnd.microsoft.icon')

# Image filters -------------------------------------------------------------

def filt_enhance(img):
    img = ImageEnhance.Contrast(img).enhance(1.35)
    img = ImageEnhance.Color(img).enhance(1.30)
    return ImageEnhance.Sharpness(img).enhance(1.2)

def filt_epic(img):
    img = ImageEnhance.Contrast(img).enhance(1.5)
    img = ImageEnhance.Brightness(img).enhance(0.7)
    r, g, b = img.split()
    b = ImageEnhance.Brightness(b).enhance(1.2)
    return Image.merge('RGB', (r, g, b))

def filt_vivid(img):
    img = ImageEnhance.Color(img).enhance(1.75)
    img = ImageEnhance.Contrast(img).enhance(1.15)
    return ImageEnhance.Brightness(img).enhance(1.12)

def filt_bw(img):
    img = ImageOps.grayscale(img).convert('RGB')
    return ImageEnhance.Contrast(img).enhance(1.4)

def filt_lofi(img):
    img = ImageEnhance.Contrast(img).enhance(0.75)
    img = ImageEnhance.Color(img).enhance(0.7)
    img = ImageEnhance.Brightness(img).enhance(1.07)
    return img.filter(ImageFilter.GaussianBlur(radius=1)).convert('RGB')

FILTERS = {'enhance':filt_enhance,'epic':filt_epic,'vivid':filt_vivid,'bw':filt_bw,'lofi':filt_lofi}

@app.route('/api/filter', methods=['POST'])
def apply_filter():
    data = request.json or {}
    filename = data.get('filename')
    filter_name = data.get('filter')
    if not filename or not filter_name:
        return jsonify({'error':'filename and filter required'}), 400
    img_path = os.path.join(IMAGE_FOLDER, filename)
    if not os.path.exists(img_path):
        return jsonify({'error':'Image not found'}), 404
    if filter_name not in FILTERS:
        return jsonify({'error':'Unknown filter'}), 400

    img = Image.open(img_path).convert('RGB')
    img = _resize_fit(img, max_edge=IMAGE_MAX_EDGE)  # clamp size to save RAM
    img = FILTERS[filter_name](img)

    data_url = _to_webp_dataurl(img, quality=WEBP_QUALITY)
    return jsonify({'dataUrl': data_url})

# Save client-side canvas as slide -----------------------------------------

@app.route('/api/save_slide', methods=['POST'])
def save_slide():
    data     = request.json or {}
    filename = data.get('filename')
    data_url = data.get('dataUrl')
    if not filename or not data_url:
        return jsonify({'error':'filename and dataUrl required'}), 400

    try:
        _, b64 = data_url.split(',', 1)
        src = Image.open(BytesIO(base64.b64decode(b64))).convert('RGB')
        src = _resize_fit(src, max_edge=max(IMAGE_MAX_EDGE, 2560))  # keep slides nicer but not huge
        out_fn = _ensure_webp_filename(secure_filename(filename))
        out_path = os.path.join(OUTPUT_FOLDER, out_fn)
        src.save(out_path, format='WEBP', quality=max(80, WEBP_QUALITY), method=4)
        return jsonify({'path': f'/share/{out_fn}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# QR helper ----------------------------------------------------------------

@app.route('/qr')
def qr_code():
    import qrcode
    ip = get_local_ip()
    share_url = f'http://{ip}:{app.config.get("PORT", 5000)}/share/'
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(share_url)
    qr.make(fit=True)
    img = qr.make_image()
    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

# ─── Stem splitter endpoints ----------------------------------------------

@app.route('/api/split', methods=['POST'])
def api_split():
    """Upload audio and split with Demucs.
    Form: file=<audio>, mode=2stem|4stem (default 2stem)
    Returns { ok, stems: {name:url}, out_dir }
    """
    if 'file' not in request.files:
        return jsonify({'ok': False, 'error': 'No file'}), 400
    f = request.files['file']
    mode = request.form.get('mode', '2stem')

    safe = secure_filename(f.filename or 'track.wav')
    in_path = os.path.join(AUDIO_INPUT, safe)
    f.save(in_path)

    try:
        out_dir = run_demucs(in_path, mode)
        rel_map = collect_stems(out_dir)
        base = request.host_url.rstrip('/')
        stems = {k: f"{base}/stems/{v}" for k, v in rel_map.items()}
        return jsonify({'ok': True, 'stems': stems, 'out_dir': str(out_dir)})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

@app.route('/stems/<path:subpath>')
def serve_stem(subpath):
    full = Path(STEMS_OUTPUT) / subpath
    if not full.exists():
        return ('Not Found', 404)
    return send_from_directory(full.parent, full.name)

# ─── Corpus upload ---------------------------------------------------------

@app.route('/upload-corpus', methods=['POST'])
def upload_corpus():
    file = request.files.get('file')
    if not file or not file.filename.endswith('.txt'):
        return jsonify({'success': False, 'error': 'Only .txt files allowed'}), 400
    style_name = os.path.splitext(secure_filename(file.filename))[0]
    file.save(os.path.join(CORPORA_DIR, f'{style_name}.txt'))
    return jsonify({'success': True, 'style': style_name})

# ─── Simple one-file splitter page (for convenience) ──────────────────────

SPLITTER_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SLITO EX – Stem Splitter</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin:0; background:#f6fbff; }
    .container { max-width: 940px; margin: 0 auto; padding: 18px; }
    .card { max-width: 860px; margin: 24px auto; padding: 18px; background: #fafdff; border-radius: 20px; border: 2px solid #bfe9ff; box-shadow: 0 10px 38px #b0e4ff2e; }
    .drop { border: 2px dashed #a8e0f7; border-radius: 14px; padding: 20px; text-align: center; background: linear-gradient(145deg, #e6f7ff 40%, #e7fcff 100%); color: #2291c8; font-weight: 700; cursor: pointer; }
    .drop input { display: none; }
    .row { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin: 14px 0; }
    .hint { color:#6a94ad; font-size:.95rem; margin-top:6px; }
    #overlay { display:none; position:fixed; inset:0; background:rgba(10,10,10,0.75); z-index:9999; justify-content:center; align-items:center; color:#08a8ea; font-weight:700; font-size:1.1rem; }
    .pill { display:inline-block; padding:6px 10px; border-radius:999px; background:#e3f8ff; border:1.5px solid #bfe9ff; color:#1596c5; font-weight:700; font-size:.9rem; }
    audio { width: 100%; margin-top: 6px; }
    .stem { padding:10px 12px; border:1px solid #e6f3fb; border-radius:12px; background:#fbfeff; margin-bottom:10px; }
    .btn { cursor:pointer; border:none; border-radius:10px; padding:10px 14px; font-weight:700; }
    .btn-primary { background:#14b8ff; color:white; }
    .btn-secondary { background:#e9f7ff; color:#0f7dab; text-decoration:none; display:inline-block; }
    .error { color:#b00020; font-weight:700; margin-top:8px; }
    header.app-header { display:flex; justify-content:space-between; align-items:center; padding:10px 0; }
    header.app-header h1 { margin:0; font-size:1.1rem; letter-spacing:.12em; color:#0f7dab; }
  </style>
</head>
<body>
  <div id="overlay">Splitting your audio…</div>
  <div class="container">
    <header class="app-header">
      <h1>SLITO EX</h1>
      <div>Stem Splitter</div>
    </header>

    <div class="card">
      <p class="hint">Upload one audio file. We’ll run Demucs and give you stems back with download links.</p>

      <form id="split-form" novalidate>
        <label class="drop" id="drop" for="file">
          <div>🎵 Drop or choose an audio file</div>
          <div class="hint">MP3 / WAV / M4A</div>
          <input id="file" name="file" type="file" accept="audio/*" />
          <div class="pill" id="picked" style="display:none;"></div>
        </label>

        <div class="row">
          <label for="mode">Stems:</label>
          <select id="mode" style="max-width:220px;">
            <option value="2stem" selected>2-stem (Vocals + No-Vocals)</option>
            <option value="4stem">4-stem (Vocals / Bass / Drums / Other)</option>
          </select>
        </div>

        <div class="row">
          <button type="submit" class="btn btn-primary">Split Stems</button>
          <a href="/" class="btn btn-secondary">← Home</a>
        </div>
      </form>

      <div id="out" style="display:none; margin-top:14px;">
        <h3>Stems</h3>
        <div id="stems"></div>
      </div>

      <div id="err" class="error" style="display:none;"></div>
    </div>
  </div>

  <script>
    const $ = s => document.querySelector(s);
    const file = $('#file'), drop = $('#drop'), picked = $('#picked');
    const overlay = $('#overlay'), err = $('#err'), out = $('#out'), stemsBox = $('#stems');

    function showOverlay(b){ overlay.style.display = b ? 'flex' : 'none'; }
    function setPicked(){ if(file.files[0]){ picked.textContent = file.files[0].name; picked.style.display='inline-block'; } }

    ;['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.background='#e9fbff'; }));
    ;['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.style.background=''; }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files?.[0]; if(f){ file.files = e.dataTransfer.files; setPicked(); }});
    file.addEventListener('change', setPicked);

    document.getElementById('split-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      err.style.display='none'; out.style.display='none'; stemsBox.innerHTML='';
      if(!file.files[0]){ err.textContent='Choose a file first.'; err.style.display='block'; return; }

      const fd = new FormData();
      fd.append('file', file.files[0]);
      fd.append('mode', document.getElementById('mode').value || '2stem');

      try {
        showOverlay(true);
        const res = await fetch('/api/split', { method:'POST', body: fd });
        const json = await res.json();
        if(!res.ok || !json.ok){ throw new Error(json.error || 'Split failed'); }

        const stems = json.stems || {};
        const names = Object.keys(stems);
        if(!names.length){ throw new Error('No stems returned'); }

        names.sort((a,b)=>a.localeCompare(b));
        for(const name of names){
          const url = stems[name];
          const card = document.createElement('div');
          card.className = 'stem';
          card.innerHTML = `
            <div><b>${name}</b></div>
            <audio controls src="${url}"></audio>
            <div style="margin-top:6px;">
              <a class="btn btn-secondary" href="${url}" download>Download</a>
            </div>`;
          stemsBox.appendChild(card);
        }
        out.style.display='block';
      } catch(ex) {
        console.error(ex);
        err.textContent = ex.message || 'Something went wrong.';
        err.style.display='block';
      } finally {
        showOverlay(false);
      }
    });
  </script>
</body>
</html>
"""

@app.route('/splitter')
def splitter():
    return render_template_string(SPLITTER_HTML)

# ─── Main ─────────────────────────────────────────

if __name__ == '__main__':
    import threading
    import webbrowser

    PORT = int(os.environ.get('PORT', '5000'))
    app.config['PORT'] = PORT

    ip        = get_local_ip()
    share_url = f'http://{ip}:{PORT}/share/'
    print(f"\n→ Phone-share URL: {share_url}\n")

    def open_browser():
        time.sleep(1)
        try:
            webbrowser.open(f'http://127.0.0.1:{PORT}/remix')
        except Exception:
            pass

    threading.Thread(target=open_browser, daemon=True).start()

    # waitress is optional; fallback to Flask dev server if not installed
    try:
        from waitress import serve
        serve(app, host='0.0.0.0', port=PORT)
    except Exception:
        app.run(host='0.0.0.0', port=PORT)
