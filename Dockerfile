# Use a small Python image
FROM python:3.10-slim

# Faster/cleaner installs
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

# System deps for audio stack
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
 && rm -rf /var/lib/apt/lists/*

# Workdir
WORKDIR /app

# Install Python deps first (better caching)
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Now copy your whole repo (templates/, static/, images/, your .py files, etc.)
COPY . .

# Create folders your app expects (safe if they already exist)
RUN mkdir -p /app/corpora /app/images /app/slides /app/mega_slides /app/slitoex/audio_input /app/slitoex/stems

# Env defaults (you can override on the platform)
ENV FLASK_SECRET_KEY=Julia050607 \
    CORPORA_DIR=/app/corpora \
    PORT=7860

# Expose the port most platforms expect (HF Spaces uses 7860)
EXPOSE 7860

# Start the server. If you use a different main file, change 'app.py'.
# Your script already binds to 0.0.0.0 and respects $PORT.
CMD ["python", "app.py"]
