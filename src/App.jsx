import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function VideoScreenshotTool() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [screenshots, setScreenshots] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [progress, setProgress] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  /* -------------------- Upload -------------------- */

  const handleVideoUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('video/')) {
      alert('Please upload a valid video file');
      return;
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    setIsUploading(true);
    setVideoLoaded(false);
    setScreenshots([]);
    setProcessingStatus('');
    setProgress(0);

    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  };

  /* -------------------- Video Load -------------------- */

  const handleVideoLoaded = () => {
    setVideoLoaded(true);
    setIsUploading(false);
  };

  /* -------------------- Helpers -------------------- */

  const waitForSeek = (video) =>
    new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', finish);
        resolve();
      };
      video.addEventListener('seeked', finish);
      setTimeout(finish, 250); // safety fallback
    });

  const toGrayscale = (img) => {
    const d = img.data;
    const gray = new Uint8ClampedArray(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    return gray;
  };

  const uiDiff = (a, b) => {
    let diff = 0;
    const STEP = 20;
    for (let i = 0; i < a.length; i += STEP) {
      diff += Math.abs(a[i] - b[i]);
    }
    return diff / (a.length / STEP);
  };

  const exportFullFrame = (video) => {
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  };

  const formatTime = (s) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  /* -------------------- Processing -------------------- */

  const processVideo = async () => {
    const video = videoRef.current;
    if (!video || !videoLoaded) return;

    setIsProcessing(true);
    setScreenshots([]);
    setProcessingStatus('Analyzing UI changes…');
    setProgress(0);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // 🔥 Downscale for UI stability
    const SCALE = 0.25;
    canvas.width = video.videoWidth * SCALE;
    canvas.height = video.videoHeight * SCALE;

    const duration = video.duration;
    const STEP = 0.4;
    const timestamps = [];
    for (let t = 0; t < duration; t += STEP) timestamps.push(t);

    const captured = [];
    let lastFrame = null;
    let lastCaptureTs = -10;
    let changeBurst = false;

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      video.currentTime = ts;
      await waitForSeek(video);

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gray = toGrayscale(frame);

      let capture = false;
      let diff = 0;

      if (!lastFrame) {
        capture = true;
      } else {
        diff = uiDiff(lastFrame, gray);
        if (diff > 6) capture = true;                // navigation
        if (diff > 3 && !changeBurst) capture = true; // burst start
        if (diff < 2 && changeBurst) capture = true;  // burst end
      }

      if (diff > 3) changeBurst = true;
      if (diff < 2) changeBurst = false;

      if (capture && ts - lastCaptureTs > 0.3) {
        captured.push({
          timestamp: ts,
          formattedTime: formatTime(ts),
          dataUrl: exportFullFrame(video)
        });
        lastFrame = gray;
        lastCaptureTs = ts;
      }

      setProgress(Math.round((i / timestamps.length) * 100));
    }

    setScreenshots(captured);
    setProcessingStatus(`✓ Captured ${captured.length} UI screens`);
    setIsProcessing(false);
    video.currentTime = 0;
  };

  /* -------------------- ZIP Download -------------------- */

  const downloadAsZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder('screenshots');

    screenshots.forEach((shot, i) => {
      folder.file(
        `shot_${String(i + 1).padStart(3, '0')}_${shot.formattedTime.replace(':', '-')}.jpg`,
        shot.dataUrl.split(',')[1],
        { base64: true }
      );
    });

    saveAs(await zip.generateAsync({ type: 'blob' }), 'video_screenshots.zip');
  };

  /* -------------------- UI -------------------- */

  return (
    <div className="p-6 bg-slate-900 text-white min-h-screen">
      {/* Header */}
      <div className="mb-6 max-w-3xl">
        <h1 className="text-3xl font-bold">AI UI Flow Screenshot Generator</h1>
        <p className="text-slate-400 mt-1">
          Automatically captures meaningful UI state changes from demo videos
          to generate clean, timestamped screenshots for flows and documentation.
        </p>
      </div>

      <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={handleVideoUpload} />

      {!videoUrl && (
        <button
          onClick={() => fileInputRef.current.click()}
          className="p-4 border-2 border-dashed rounded"
        >
          Upload Video
        </button>
      )}

      {videoUrl && (
        <>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={handleVideoLoaded}
            className="w-full mt-4"
          />

          {videoLoaded && (
            <div className="mt-4 space-x-3">
              <button
                onClick={processVideo}
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-600 rounded"
              >
                {isProcessing ? 'Processing…' : 'Capture Screenshots'}
              </button>

              {screenshots.length > 0 && (
                <button
                  onClick={downloadAsZip}
                  className="px-4 py-2 bg-green-600 rounded"
                >
                  Download ZIP
                </button>
              )}
            </div>
          )}

          {/* Progress Bar */}
          {isProcessing && (
            <div className="mt-4 max-w-xl">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Analyzing UI frames</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-700 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {processingStatus && (
            <p className="mt-3 text-green-400">{processingStatus}</p>
          )}

          {/* Screenshot Preview Grid */}
          {screenshots.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-3">
                Captured Screens ({screenshots.length})
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {screenshots.map((shot, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-800 border border-slate-700 rounded overflow-hidden"
                  >
                    <img src={shot.dataUrl} alt="" className="w-full object-contain" />
                    <div className="text-xs text-slate-400 px-2 py-1 text-center bg-slate-900">
                      {shot.formattedTime}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <canvas ref={canvasRef} hidden />

      {/* Footer */}
      <p className="text-xs text-slate-500 mt-8 border-t border-slate-700 pt-3 max-w-3xl">
        Processing happens entirely in your browser. Videos are never uploaded
        or stored on any server. Performance depends on your device.
      </p>
    </div>
  );
}
