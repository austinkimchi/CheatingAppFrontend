
import React, { useEffect, useRef, useState } from "react";
const DEFAULT_RESOLUTION = 2048;
const Camera = ({ wsUrl /*, postUrl*/ }) => {
    const videoRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const wsRef = useRef(null);

    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState(null);
    const [facingMode, setFacingMode] = useState("environment"); // "environment" or "user"
    const [sessionId, setSessionId] = useState(null);
    const ALL_ITEMS = ["Phone", "Laptop", "Pen", "Beverages", "Calculator", "Notebook"];
    const [selectedFilter, setSelectedFilter] = useState([]);
    const [hasSentFilter, setHasSentFilter] = useState(false);

    // Pick a supported MIME for the recorder (Chrome/Edge: video/webm;codecs=vp8|vp9, Safari 17+: video/mp4;codecs=h264)
    function pickMimeType() {
        const candidates = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
            "video/mp4;codecs=h264,aac", // Safari (when available)
            "video/mp4",                 // Safari fallback
        ];
        for (const c of candidates) {
            if (MediaRecorder.isTypeSupported(c)) return c;
        }
        return ""; // let browser choose
    }

    async function start() {
        try {
            setError(null);
            // 0) Verify filters are selected at least 1
            if (selectedFilter.length === 0) {
                setError("Please select at least one disallowed item.");
                return;
            }


            // 1) Get camera/mic
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 24 }, facingMode: facingMode },
                audio: false,
            });
            mediaStreamRef.current = stream;

            // 2) Show preview
            console.log("Starting preview");
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            // Before sending, crop to square 
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            const dim = Math.min(settings.width || DEFAULT_RESOLUTION, settings.height || DEFAULT_RESOLUTION);
            await videoTrack.applyConstraints({
                width: dim,
                height: dim,
            });

            // 3) Connect to WebSocket (if using WS)
            console.log("Connecting to WebSocket:", wsUrl);
            wsRef.current = new WebSocket(wsUrl);
            await new Promise((resolve, reject) => {
                wsRef.current.onopen = () => resolve();
                wsRef.current.onerror = (err) => reject(err);
            });

            wsRef.current.onopen= () => {
                if (!hasSentFilter) {
                    const payload = {
                        filter: (selectedFilter && selectedFilter.length > 0) ? selectedFilter : ALL_ITEMS,
                    };
                    console.log("Sending filter payload:", payload);
                    wsRef.current.send(JSON.stringify(payload));
                    setHasSentFilter(true);
                }
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.session) {
                        setSessionId(data.session);
                    } else {
                        console.log("Message from server:", data);
                    }
                } catch (e) {
                    console.warn("Non-JSON message:", event.data, e);
                }
            };

            if (wsRef.current.readyState === WebSocket.OPEN && !hasSentFilter) {
                const payload = {
                    filter: (selectedFilter && selectedFilter.length > 0) ? selectedFilter : ALL_ITEMS,
                };
                console.log("Sending filter payload:", payload);
                wsRef.current.send(JSON.stringify(payload));
                setHasSentFilter(true);
            }

            // 4) Start MediaRecorder and stream chunks
            console.log("Starting MediaRecorder");
            const mimeType = pickMimeType();
            const mr = new MediaRecorder(stream, {
                mimeType: mimeType || undefined,
                videoBitsPerSecond: 2_000_000, // ~2 Mbps
                audioBitsPerSecond: 0, // we don't need audio
            });
            mediaRecorderRef.current = mr;

            mr.ondataavailable = async (ev) => {
                if (!ev.data || ev.data.size === 0) return;
                const blob = ev.data;

                // --- WebSocket streaming ---
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    const buf = await blob.arrayBuffer();
                    wsRef.current.send(buf);
                }
            };


            mr.onerror = (e) => {
                console.error("MediaRecorder error:", e);
                setError("MediaRecorder error. Try a different browser or permissions.");
                stop();
            };

            // change if you want different chunk interval
            mr.start(500);
            setIsStreaming(true);
        } catch (e) {
            console.error(e);
            setError(e?.message || "Failed to access camera/mic or start stream.");
            stop();
        }
    }

    function stop() {
        setIsStreaming(false);
        setHasSentFilter(false);

        // Stop recorder
        try {
            mediaRecorderRef.current?.state !== "inactive" && mediaRecorderRef.current?.stop();
        } catch {
            console.error("MediaRecorder stop error");
        }
        mediaRecorderRef.current = null;

        // Close WS
        try {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close(1000, "client stop");
            }
        } catch {
            console.error("WebSocket close error");
        }
        wsRef.current = null;
        setSessionId(null);

        // Stop tracks
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
        }

        // Clear preview
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }

    function onFilterChange(e) {
        const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
        setSelectedFilter(opts);
    }

    useEffect(() => {
        return () => stop(); // cleanup on unmount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="p-4 rounded-2xl shadow">
            {!isStreaming && (
                <div className="mb-3">
                    <label className="block text-sm font-medium mb-1">Select Disallowed Items</label>
                    <select
                        multiple
                        value={selectedFilter}
                        onChange={onFilterChange}
                        className="w-full border rounded-lg p-2 min-h-[120px]"
                        aria-label="Disallowed Items"
                    >
                        {ALL_ITEMS.map((it) => (
                            <option key={it} value={it}>{it}</option>
                        ))}
                    </select>
                    <p className="text-xs text-neutral-600 mt-1">
                        Select one or more items. This selection is sent once when you start the stream and
                        can't be changed during streaming.
                    </p>
                </div>
            )}
            <div className="flex items-center gap-3 mb-3 justify-center">
                <button
                    onClick={isStreaming ? stop : start}
                    className={`px-4 py-2 rounded-xl ${isStreaming ? "bg-red-600" : "bg-black"}`}
                >
                    {isStreaming ? "Stop" : "Start"} Camera Stream
                </button>
                {error && <span className="text-red-600 text-sm">{error}</span>}
            </div>

            <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                width="100%"
                // className="w-full max-w-full aspect-video bg-black rounded-xl"
            />
            <p className="text-xs text-neutral-600 mt-2">
                {sessionId
                    ? `Session ID: ${sessionId}`
                    : "Tip: If you see a blank preview, check browser permissions and that no other tab is using the camera."}
            </p>
        </div>
    );
};

export default Camera;
