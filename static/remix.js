// TikTok Remix Lab (remix.js)
// Basic browser DAW: loads, mixes, crops, pitch/time shifts instrumental & vocal.

let instrBuffer = null, vocalBuffer = null;
let instrFileName = "", vocalFileName = "";
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const instrInput = document.getElementById('instr-file');
const vocalInput = document.getElementById('vocal-file');
const previewAudio = document.getElementById('preview-audio');
const downloadLink = document.getElementById('download-link');

async function fileToBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            audioCtx.decodeAudioData(e.target.result, resolve, reject);
        };
        reader.readAsArrayBuffer(file);
    });
}

instrInput.onchange = async function(e) {
    const file = e.target.files[0];
    if (file) {
        instrBuffer = await fileToBuffer(file);
        instrFileName = file.name;
        alert('Instrumental loaded: ' + file.name);
    }
};
vocalInput.onchange = async function(e) {
    const file = e.target.files[0];
    if (file) {
        vocalBuffer = await fileToBuffer(file);
        vocalFileName = file.name;
        alert('Vocal loaded: ' + file.name);
    }
};

// Use SoundTouchJS for pitch/time stretching
function stretchBuffer(srcBuffer, tempo=1.0, pitch=1.0) {
    // SoundTouch works on Float32Array channel data.
    // Returns a new AudioBuffer
    const channels = [];
    for (let ch = 0; ch < srcBuffer.numberOfChannels; ch++) {
        channels.push(srcBuffer.getChannelData(ch));
    }
    const st = new soundtouch.SoundTouch(srcBuffer.sampleRate);
    st.tempo = tempo; // speed: 1.0 = normal, <1 slower, >1 faster
    st.pitch = pitch; // pitch: 1.0 = normal, <1 lower, >1 higher
    const proc = new soundtouch.SimpleFilter(
        new soundtouch.BufferSource(channels, srcBuffer.sampleRate),
        st
    );
    const out = [];
    let samples;
    do {
        samples = proc.extract(2048);
        if (samples.length > 0) out.push(...samples);
    } while (samples.length > 0);
    // Only works for mono or simple stereo!
    const outBuffer = audioCtx.createBuffer(1, out.length, srcBuffer.sampleRate);
    outBuffer.copyToChannel(new Float32Array(out), 0);
    return outBuffer;
}

// Combine two buffers (simple overlay; not professional mixing)
function combineBuffers(instr, vocal, cutStart = 0, cutEnd = null, offset = 0) {
    if (!instr || !vocal) return null;
    const sampleRate = instr.sampleRate;
    let length = Math.min(instr.length, vocal.length);
    let startIdx = Math.floor(cutStart * sampleRate);
    let endIdx = cutEnd ? Math.min(Math.floor(cutEnd * sampleRate), length) : length;
    length = endIdx - startIdx;
    if (length <= 0) return null;

    // Support stereo or mono for both buffers
    let outChannels = Math.max(instr.numberOfChannels, vocal.numberOfChannels);
    let output = audioCtx.createBuffer(outChannels, length, sampleRate);
    for (let ch = 0; ch < outChannels; ch++) {
        let instrData = instr.getChannelData(ch % instr.numberOfChannels);
        let vocalData = vocal.getChannelData(ch % vocal.numberOfChannels);
        let outData = output.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            let instrIdx = startIdx + i;
            let vocalIdx = startIdx + i + offset;
            outData[i] = (instrData[instrIdx] || 0) + (vocalData[vocalIdx] || 0);
        }
    }
    return output;
}

// WAV export utility (from Jam3/audiobuffer-to-wav)
function bufferToWavBlob(buffer) {
    function encodeWAV(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;
        const length = audioBuffer.length * numChannels * 2 + 44;
        const arrayBuffer = new ArrayBuffer(length);
        const view = new DataView(arrayBuffer);
        /* RIFF identifier */
        writeString(view, 0, 'RIFF');
        /* file length */
        view.setUint32(4, 36 + audioBuffer.length * numChannels * 2, true);
        /* RIFF type */
        writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        writeString(view, 12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw) */
        view.setUint16(20, format, true);
        /* channel count */
        view.setUint16(22, numChannels, true);
        /* sample rate */
        view.setUint32(24, sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, sampleRate * numChannels * 2, true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, numChannels * 2, true);
        /* bits per sample */
        view.setUint16(34, bitDepth, true);
        /* data chunk identifier */
        writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, audioBuffer.length * numChannels * 2, true);

        // Write interleaved PCM samples
        let offset = 44;
        for (let i = 0; i < audioBuffer.length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                let sample = audioBuffer.getChannelData(ch)[i];
                sample = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }
        return arrayBuffer;
    }
    function writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }
    const wav = encodeWAV(buffer);
    return new Blob([wav], { type: 'audio/wav' });
}

// Preview
document.getElementById('preview-btn').onclick = function () {
    if (!instrBuffer || !vocalBuffer) return alert("Upload both files first!");
    let cutStart = +document.getElementById('cut-start').value || 0;
    let cutEnd = +document.getElementById('cut-end').value || null;
    let mixed = combineBuffers(instrBuffer, vocalBuffer, cutStart, cutEnd, 0);
    if (!mixed) return alert("Problem with cut/length.");
    // Play result as a blob (works on iPhone/Android)
    let wavBlob = bufferToWavBlob(mixed);
    let url = URL.createObjectURL(wavBlob);
    previewAudio.src = url;
    previewAudio.play();
};

// Export for TikTok (WAV)
document.getElementById('export-btn').onclick = function () {
    if (!instrBuffer || !vocalBuffer) return alert("Upload both files first!");
    let cutStart = +document.getElementById('cut-start').value || 0;
    let cutEnd = +document.getElementById('cut-end').value || null;
    let mixed = combineBuffers(instrBuffer, vocalBuffer, cutStart, cutEnd, 0);
    if (!mixed) return alert("Problem with cut/length.");
    let wavBlob = bufferToWavBlob(mixed);
    let url = URL.createObjectURL(wavBlob);
    downloadLink.style.display = 'inline';
    downloadLink.href = url;
    downloadLink.download = "remix.wav";
    downloadLink.textContent = "Download Remix";
};

// Basic BPM/Key fit stubs (real implementation is advanced, here is how to wire UI)
document.getElementById('fit-vocal-to-instr').onclick = function () {
    alert("In browser, automatic BPM/key sync is experimental.\nSee soundtouchjs or audiolib.js for time-stretching. Demo will be basic.");
    // For real: stretchBuffer(vocalBuffer, desiredTempo/instrTempo, desiredPitch/instrPitch);
};
document.getElementById('fit-instr-to-vocal').onclick = function () {
    alert("In browser, automatic BPM/key sync is experimental.\nSee soundtouchjs or audiolib.js for time-stretching. Demo will be basic.");
    // For real: stretchBuffer(instrBuffer, desiredTempo/vocalTempo, desiredPitch/vocalPitch);
};

// Cut/crop stub, handled via combineBuffers and cutStart/cutEnd

document.getElementById('cut-btn').onclick = function () {
    // Just updates the preview to show the cut part
    document.getElementById('preview-btn').click();
};
