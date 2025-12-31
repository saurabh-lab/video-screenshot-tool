import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function VideoScreenshotTool() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [screenshots, setScreenshots] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

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

    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
  };

  /* -------------------- Video Load -------------------- */

  const handleVideoLoaded = () => {
    const video = videoRef.current;
    if (!video) return;

    setVideoInfo({
      duration: video.duration,
      durationFormatted: `${Math.floor(video.duration / 60)}m ${Math.floor(video.duration % 60)}s`,
      width: video.videoWidth,
      height: video.videoHeight,
      fileName: videoFile.name,
      fileSize: (videoFile.size / (1024 * 1024)).toFixed(2) + ' MB'
    });

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

      // 🔒 Safety fallback
      setTimeout(finish, 250);
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

    for (let ts of timestamps) {
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
        if (diff > 6) capture = true;
        if (diff > 3 && !changeBurst) capture = true;
        if (diff < 2 && changeBurst) capture = true;
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
    }

    setScreenshots(captured);
    setProcessingStatus(`✓ Captured ${captured.length} UI screens`);
    setIsProcessing(false);
    video.currentTime = 0;
  };

  /* -------------------- ZIP Download -------------------- */

  const downloadAsZip = async () => {
    if (!screenshots.length) return;

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
      <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={handleVideoUpload} />

      {!videoUrl && (
        <button onClick={() => fileInputRef.current.click()} className="p-4 border-2 border-dashed rounded">
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
              <button onClick={processVideo} disabled={isProcessing} className="px-4 py-2 bg-blue-600 rounded">
                {isProcessing ? 'Processing…' : 'Capture Screenshots'}
              </button>

              {screenshots.length > 0 && (
                <button onClick={downloadAsZip} className="px-4 py-2 bg-green-600 rounded">
                  Download ZIP
                </button>
              )}
            </div>
          )}

          {processingStatus && <p className="mt-3 text-green-400">{processingStatus}</p>}
        </>
      )}

      <canvas ref={canvasRef} hidden />
    </div>
  );
}