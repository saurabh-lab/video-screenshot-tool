import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function VideoScreenshotTool() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [flows, setFlows] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  /* ---------------- Upload ---------------- */

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('video/')) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);

    setFlows([]);
    setProgress(0);
    setStatus('');
    setVideoLoaded(false);

    setVideoUrl(URL.createObjectURL(file));
  };

  /* ---------------- Helpers ---------------- */

  const waitForSeek = (video) =>
    new Promise((res) => {
      const done = () => {
        video.removeEventListener('seeked', done);
        res();
      };
      video.addEventListener('seeked', done);
      setTimeout(done, 200);
    });

  const toGray = (img) => {
    const d = img.data;
    const g = new Uint8ClampedArray(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    return g;
  };

  const diffScore = (a, b) => {
    let diff = 0;
    for (let i = 0; i < a.length; i += 20) {
      diff += Math.abs(a[i] - b[i]);
    }
    return diff / (a.length / 20);
  };

  const exportFrame = (video) => {
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
  };

  const fmt = (s) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60)
      .toString()
      .padStart(2, '0')}`;

  /* ---------------- Processing ---------------- */

  const processVideo = async () => {
    const video = videoRef.current;
    if (!video || !videoLoaded) return;

    setIsProcessing(true);
    setStatus('Analyzing UI changes…');
    setFlows([]);
    setProgress(0);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const SCALE = 0.25;
    canvas.width = video.videoWidth * SCALE;
    canvas.height = video.videoHeight * SCALE;

    const timestamps = [];
    for (let t = 0; t < video.duration; t += 0.4) timestamps.push(t);

    let lastFrame = null;
    let lastCaptureTs = -10;
    let currentFlow = { id: 1, screens: [] };
    const allFlows = [];

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      video.currentTime = ts;
      await waitForSeek(video);

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const gray = toGray(frame);

      let capture = false;
      let diff = 0;

      if (!lastFrame) {
        capture = true;
      } else {
        diff = diffScore(lastFrame, gray);
        if (diff > 6) {
          allFlows.push(currentFlow);
          currentFlow = { id: currentFlow.id + 1, screens: [] };
          capture = true;
        } else if (diff > 3) {
          capture = true;
        }
      }

      if (capture && ts - lastCaptureTs > 0.3) {
        currentFlow.screens.push({
          timestamp: ts,
          formattedTime: fmt(ts),
          dataUrl: exportFrame(video)
        });
        lastFrame = gray;
        lastCaptureTs = ts;
      }

      setProgress(Math.round((i / timestamps.length) * 100));
    }

    if (currentFlow.screens.length) allFlows.push(currentFlow);

    setFlows(allFlows);
    setStatus(`✓ ${allFlows.length} flows captured`);
    setIsProcessing(false);
    video.currentTime = 0;
  };

  /* ---------------- ZIP Export ---------------- */

  const downloadZip = async () => {
    const zip = new JSZip();

    flows.forEach((flow) => {
      const folder = zip.folder(`flow_${flow.id}`);
      flow.screens.forEach((s, i) => {
        folder.file(
          `step_${i + 1}_${s.formattedTime.replace(':', '-')}.jpg`,
          s.dataUrl.split(',')[1],
          { base64: true }
        );
      });
    });

    saveAs(await zip.generateAsync({ type: 'blob' }), 'ui_flows.zip');
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="p-6 bg-slate-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold">AI UI Flow Screenshot Generator</h1>
      <p className="text-slate-400 max-w-3xl mt-1">
        Automatically capture meaningful UI state changes from demo videos.
      </p>

      <p className="text-xs text-slate-500 mt-2">
        Processing happens locally in your browser. Videos are not uploaded.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={handleUpload}
      />

      {!videoUrl && (
        <button
          onClick={() => fileInputRef.current.click()}
          className="mt-6 p-4 border-2 border-dashed rounded"
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
            muted
            className="w-full mt-4"
            onLoadedMetadata={() => setVideoLoaded(true)}
          />

          {videoLoaded && (
            <div className="mt-4 space-x-3">
              <button
                onClick={processVideo}
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-600 rounded"
              >
                Capture Screenshots
              </button>

              {flows.length > 0 && (
                <button
                  onClick={downloadZip}
                  className="px-4 py-2 bg-green-600 rounded"
                >
                  Download ZIP
                </button>
              )}
            </div>
          )}

          {isProcessing && (
            <div className="mt-4 max-w-xl">
              <div className="w-full h-2 bg-slate-700 rounded">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {status && <p className="mt-3 text-green-400">{status}</p>}

          {/* FLOW VIEW */}
          {flows.map((flow) => (
            <div key={flow.id} className="mt-8">
              <h2 className="text-lg font-semibold mb-3">
                Flow {flow.id} ({flow.screens.length} screens)
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {flow.screens.map((s, i) => (
                  <div key={i} className="bg-slate-800 rounded">
                    <img src={s.dataUrl} alt="" />
                    <div className="text-xs text-center text-slate-400 p-1">
                      {s.formattedTime}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <canvas ref={canvasRef} hidden />
    </div>
  );
}
