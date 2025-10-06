import os
import sys
import random
import base64
import time
import socket
import subprocess
from io import BytesIO
from pathlib import Path

from flask import (
    Flask, render_template, request, jsonify, send_from_directory,
    session, redirect, url_for, send_file, render_template_string
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

"""
This application powers the SLITO EX web frontend. It serves HTML templates
and exposes a JSON API for caption generation, file uploads and remixing.

Key modifications in this version:

* Support uploading custom style corpora. Users can upload their own corpus
  files (.txt) which will be stored in the directory defined by the
  environment variable `CORPORA_DIR` (default: ``./corpora``). Each file
  should be named ``<style>.txt`` and contain one caption template per line.
  These style names then automatically appear in the style picker on the
  website. The endpoint to upload a corpus is ``POST /upload-corpus``.

* Support uploading custom second‐phrase files. Users can upload a text file
  containing additional second‐phrase templates (one per line). The file will
  be stored in the path defined by `SECOND_PHRASES_FILE` (default:
  ``./second_phrases.txt``). Second phrases are chosen from either this
  uploaded list (when ``second_mode=custom``) or from a built‐in default
  list (when ``second_mode=classic``). The endpoint to upload second phrases
  is ``POST /upload-second``.

* Add ``POST /api/second_line`` to fetch a single second phrase based on
  ``second_mode`` and the provided artist name. This is used by the
  client-side JS when generating captions in lyric snippet mode.

* The caption generation logic remains backwards compatible. The existing
  ``/api/generate`` and ``/api/mega_generate`` endpoints still return a
  ``caption1`` and ``caption2`` but do not yet take a ``second_mode``
  parameter. For snippet mode with custom second phrases, the client calls
  ``/api/second_line`` to fetch the second line instead.

To integrate this app in your deployment, replace your existing ``app.py``
with this file. Ensure that ``CORPORA_DIR`` and ``SECOND_PHRASES_FILE`` are
set correctly, and that any existing corpus files live in the appropriate
directory. Custom corpus uploads and second phrase uploads happen at runtime
without restarting the server.
"""

# ─── Path Configuration ───────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    # Running in a bundled executable (e.g. PyInstaller)
    exe_dir       = os.path.dirname(sys.executable)
    IMAGE_FOLDER  = os.path.join(exe_dir, 'slitoex', 'images')
    OUTPUT_FOLDER = os.path.join(exe_dir, 'slitoex', 'slides')
    MEGA_FOLDER   = os.path.join(exe_dir, 'slitoex', 'mega_slides')
    bundle_dir    = sys._MEIPASS  # type: ignore[attr-defined]
    TEMPLATES_DIR = os.path.join(bundle_dir, 'templates')
    STATIC_DIR    = os.path.join(bundle_dir, 'static')
else:
    # Running from source
    base_dir      = os.path.dirname(os.path.abspath(__file__))
    exe_dir       = base_dir
    IMAGE_FOLDER  = os.path.join(base_dir, 'images')
    OUTPUT_FOLDER = os.path.join(base_dir, 'slides')
    MEGA_FOLDER   = os.path.join(base_dir, 'mega_slides')
    TEMPLATES_DIR = os.path.join(base_dir, 'templates')
    STATIC_DIR    = os.path.join(base_dir, 'static')

# Audio splitting I/O
AUDIO_INPUT   = os.path.join(exe_dir, 'slitoex', 'audio_input')
STEMS_OUTPUT  = os.path.join(exe_dir, 'slitoex', 'stems')

# Ensure necessary directories exist
for d in (IMAGE_FOLDER, OUTPUT_FOLDER, MEGA_FOLDER, AUDIO_INPUT, STEMS_OUTPUT):
    os.makedirs(d, exist_ok=True)

# Dropbox integration
DROPBOX_APP_KEY = 'k9qtvznx5g7g0yr'
DROPBOX_TOKEN   = os.environ.get('DROPBOX_TOKEN', '')

# Google Drive OAuth
SCOPES = ['https://www.googleapis.com/auth/drive.file']
CLIENT_SECRETS_FILE = os.environ.get('GDRIVE_CLIENT_SECRETS', 'client_secret.json')

# ─── Defaults and Environment Overrides ──────────────────────────────────

# Directory used for storing uploaded style corpora (.txt files). Each file
# corresponds to a caption style and is named ``<style>.txt``.
CORPORA_DIR = os.environ.get('CORPORA_DIR', os.path.join(exe_dir, 'corpora'))
# Path for the uploaded second phrases file. When "custom" mode is used
# for second phrases, lines from this file will be selected instead of the
# built-in list below.
SECOND_PHRASES_FILE = os.environ.get('SECOND_PHRASES_FILE', os.path.join(exe_dir, 'second_phrases.txt'))

# Ensure the corpora directory exists
os.makedirs(CORPORA_DIR, exist_ok=True)

# Default second phrase templates (fallback when custom file is absent or
# second_mode is "classic"). See explanation at top of file for
# information about modifications.
SECOND_TEMPLATES = [
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
    "This is the part where {artist} takes over",
]

# Default style keyword lists (unused by core caption logic but preserved for
# backwards compatibility with the original code). These may be used in
# other functions or endpoints.
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

# ─── Flask App Setup ─────────────────────────────────────────────────────

app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)
CORS(app)
app.secret_key = os.environ.get('FLASK_SECRET_KEY') or os.urandom(24)

# ─── Helper Functions ────────────────────────────────────────────────────

def load_corpus_lines(style=None):
    """Load caption lines for a given style or all styles.

    If ``style`` is None, return a list of all lines across all corpus files in
    ``CORPORA_DIR``. If ``style`` is specified, only lines from
    ``<style>.txt`` in that directory are returned. The ``CORPORA_DIR`` path
    is determined by environment variable or falls back to ``./corpora``.
    """
    if not os.path.isdir(CORPORA_DIR):
        os.makedirs(CORPORA_DIR, exist_ok=True)
    if style is None:
        all_lines = []
        for fn in os.listdir(CORPORA_DIR):
            if fn.endswith('.txt'):
                path = os.path.join(CORPORA_DIR, fn)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        all_lines.extend([line.strip() for line in f if line.strip()])
                except Exception:
                    continue
        return all_lines
    # Style-specific file
    fname = f"{style}.txt"
    fpath = os.path.join(CORPORA_DIR, fname)
    if not os.path.isfile(fpath):
        return None
    with open(fpath, 'r', encoding='utf-8') as f:
        return [line.strip() for line in f if line.strip()]


def load_second_phrases(mode='classic'):
    """Return a list of second phrase templates based on mode.

    ``mode`` should be either ``'custom'`` or ``'classic'`` (case insensitive).
    If ``custom`` is requested, attempt to read lines from ``SECOND_PHRASES_FILE``.
    If the file does not exist or is empty, return an empty list. If
    ``classic`` or any other value is requested, return the built-in list
    ``SECOND_TEMPLATES``.
    """
    if mode and mode.lower() == 'custom':
        # Use the user-provided file if it exists
        if os.path.isfile(SECOND_PHRASES_FILE):
            try:
                with open(SECOND_PHRASES_FILE, 'r', encoding='utf-8') as f:
                    lines = [line.strip() for line in f if line.strip()]
                    return lines
            except Exception:
                pass
        return []
    # Default to classic built-in phrases
    return SECOND_TEMPLATES


def get_local_ip():
    """Return the local IP address for QR code generation."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()


# ─── API Routes ──────────────────────────────────────────────────────────

@app.route('/')
def index():
    """Render the main index page."""
    return render_template('index.html', dropbox_app_key=DROPBOX_APP_KEY)


@app.route('/api/corpora')
def list_corpora():
    """List the available style names based on .txt files in CORPORA_DIR.

    The client uses this endpoint to refresh the style picker when new
    corpora are uploaded. Only file names without the .txt extension are
    returned.
    """
    os.makedirs(CORPORA_DIR, exist_ok=True)
    styles = []
    for fn in os.listdir(CORPORA_DIR):
        if fn.endswith('.txt'):
            styles.append(os.path.splitext(fn)[0])
    return jsonify(styles)


@app.route('/upload-corpus', methods=['POST'])
def upload_corpus():
    """Upload a new style corpus file (.txt).

    The request must contain a file part named ``file``. The filename
    determines the style name: for example, a file named ``myStyle.txt`` will
    be saved as ``corpora/myStyle.txt``. After upload, this style is
    immediately available in the style picker.
    """
    uploaded = request.files.get('file')
    if not uploaded or not uploaded.filename:
        return jsonify({'success': False, 'error': 'No file uploaded'}), 400
    if not uploaded.filename.lower().endswith('.txt'):
        return jsonify({'success': False, 'error': 'Only .txt files allowed'}), 400
    style_name = os.path.splitext(secure_filename(uploaded.filename))[0]
    dest_path = os.path.join(CORPORA_DIR, f'{style_name}.txt')
    os.makedirs(CORPORA_DIR, exist_ok=True)
    uploaded.save(dest_path)
    return jsonify({'success': True, 'style': style_name})


@app.route('/upload-second', methods=['POST'])
def upload_second():
    """Upload a file of second phrase templates.

    The request must contain a ``file`` part (a .txt file). Lines from
    this file will be used for second phrases when the client requests
    ``second_mode=custom``. Existing file contents are overwritten.
    """
    uploaded = request.files.get('file')
    if not uploaded or not uploaded.filename:
        return jsonify({'success': False, 'error': 'No file uploaded'}), 400
    if not uploaded.filename.lower().endswith('.txt'):
        return jsonify({'success': False, 'error': 'Only .txt files allowed'}), 400
    # Save the file to the designated path
    try:
        uploaded.save(SECOND_PHRASES_FILE)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    return jsonify({'success': True})


@app.route('/api/second_line', methods=['POST'])
def api_second_line():
    """Return a randomly selected second phrase.

    Accepts a JSON body with optional ``artist`` and ``second_mode`` keys.
    ``artist`` is substituted into the template. ``second_mode`` should be
    ``classic`` or ``custom`` (case insensitive). If ``custom`` and the
    custom file is empty or missing, an empty string is returned.
    """
    data = request.json or {}
    artist = (data.get('artist') or '').strip()
    mode = (data.get('second_mode') or 'classic').lower()
    options = load_second_phrases(mode)
    if not options:
        return jsonify({'line': ''})
    template = random.choice(options)
    try:
        line = template.format(artist=artist)
    except Exception:
        # If formatting fails (e.g. missing {artist}), return template
        line = template
    return jsonify({'line': line})


@app.route('/api/generate', methods=['POST'])
def generate_captions():
    """Generate captions for a single pair of images.

    This endpoint expects a JSON payload with ``artist``, ``style``,
    ``image1`` and ``image2``. It returns a JSON object with
    ``caption1`` (from the requested style corpus) and ``caption2`` (from
    the default ``SECOND_TEMPLATES`` list). For snippet mode using custom
    second phrases, the client should call ``/api/second_line`` instead of
    relying on this endpoint for ``caption2``.
    """
    data   = request.json or {}
    artist = (data.get('artist') or '').strip()
    style  = (data.get('style') or '').strip()
    lines  = load_corpus_lines(style)
    if lines is None:
        return jsonify({'error': f'Missing corpus for style {style}'}), 400
    cap1 = random.choice(lines)
    cap2 = random.choice(SECOND_TEMPLATES).format(artist=artist)
    return jsonify({'caption1': cap1, 'caption2': cap2})


@app.route('/api/mega_generate', methods=['POST'])
def mega_generate():
    """Generate 10 runs of captions and images for the mega gallery.

    This endpoint behaves similarly to the original ``/api/mega_generate``: it
    randomly selects image pairs and a style for each run. For each run it
    picks a random line from the selected style corpus and a second
    phrase from the built-in ``SECOND_TEMPLATES`` list. It does not
    currently support custom second phrases. For custom phrases use the
    client-side ``/api/second_line`` when rendering individual slides.
    """
    data   = request.json or {}
    artist = (data.get('artist') or '').strip()
    if not artist:
        return jsonify({'error': 'Artist required'}), 400
    imgs = [fn for fn in os.listdir(IMAGE_FOLDER)
            if fn.lower().endswith(('.png', 'jpg', 'jpeg'))]
    if len(imgs) < 2:
        return jsonify({'error': 'Need at least 2 images'}), 400
    # Available styles are corpora plus built-in keys in STYLE_KEYWORDS
    styles = list(STYLE_KEYWORDS.keys()) + [os.path.splitext(fn)[0] for fn in os.listdir(CORPORA_DIR) if fn.endswith('.txt')]
    runs = []
    for _ in range(10):
        st = random.choice(styles)
        lines = load_corpus_lines(st) or []
        if not lines:
            continue
        i1, i2 = random.sample(imgs, 2)
        cap1 = random.choice(lines)
        cap2 = random.choice(SECOND_TEMPLATES).format(artist=artist)
        runs.append({'image1': i1, 'image2': i2, 'caption1': cap1, 'caption2': cap2, 'style': st})
    if not runs:
        return jsonify({'error': 'No captions found for any style'}), 400
    return jsonify({'runs': runs})


# ─── The remaining endpoints below mirror original behaviour. They are
# unchanged or only lightly adapted to fit the new structure. Remixes,
# uploads and other functionality remains as in the original source.

@app.route('/remix')
def remix():
    return render_template('remix.html')

@app.route('/nichepack')
def nichepack_page():
    return render_template('nichepack.html')

@app.route('/journal')
def journal_page():
    return render_template('journal.html')

@app.route('/lyrics')
def lyrics_page():
    return render_template('lyrics.html')


@app.route('/api/images')
def list_images():
    files = sorted(
        fn for fn in os.listdir(IMAGE_FOLDER)
        if fn.lower().endswith(('.png','jpg','jpeg'))
    )
    return jsonify(files)


@app.route('/upload-image', methods=['POST'])
def upload_image():
    file = request.files.get('file')
    if not file or not file.filename:
        return jsonify({'error':'No file part'}), 400
    fn = secure_filename(file.filename)
    dest = os.path.join(IMAGE_FOLDER, fn)
    base, ext = os.path.splitext(fn)
    i = 1
    while os.path.exists(dest):
        fn = f"{base}_{i}{ext}"
        dest = os.path.join(IMAGE_FOLDER, fn)
        i += 1
    file.save(dest)
    return jsonify({'success':True,'filename':fn})


@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMAGE_FOLDER, filename)


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


@app.route('/api/save_slide', methods=['POST'])
def save_slide():
    data     = request.json or {}
    filename = data.get('filename')
    data_url = data.get('dataUrl')
    if not filename or not data_url:
        return jsonify({'error':'filename and dataUrl required'}), 400
    _, b64 = data_url.split(',', 1)
    binary = base64.b64decode(b64)
    out_fn   = secure_filename(filename)
    out_path = os.path.join(OUTPUT_FOLDER, out_fn)
    with open(out_path, 'wb') as f:
        f.write(binary)
    return jsonify({'path': f'/share/{out_fn}'})


@app.route('/share/')
def share_index():
    files = sorted(fn for fn in os.listdir(OUTPUT_FOLDER)
                   if fn.lower().endswith(('.png', '.jpg', '.jpeg', '.wav', '.mp3')))
    return render_template('share.html', files=files)


@app.route('/share/<filename>')
def share_file(filename):
    return send_from_directory(OUTPUT_FOLDER, filename)


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(STATIC_DIR, 'favicon.ico', mimetype='image/vnd.microsoft.icon')


# QR helper for sharing gallery on local network
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


# Error handlers for debugging (optional)
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    import threading
    import webbrowser
    PORT = int(os.environ.get('PORT', '5000'))
    app.config['PORT'] = PORT
    ip = get_local_ip()
    share_url = f'http://{ip}:{PORT}/share/'
    print(f"\n→ Phone-share URL: {share_url}\n")
    def open_browser():
        time.sleep(1)
        try:
            webbrowser.open(f'http://127.0.0.1:{PORT}/')
        except Exception:
            pass
    threading.Thread(target=open_browser, daemon=True).start()
    # Try waitress if available for production; fallback to Flask dev server
    try:
        from waitress import serve
        serve(app, host='0.0.0.0', port=PORT)
    except Exception:
        app.run(host='0.0.0.0', port=PORT)