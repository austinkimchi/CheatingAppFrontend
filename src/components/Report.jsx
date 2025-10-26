import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

function parseCsv(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [image, tsStr, label] = line.split(",");
      const ts = Number(tsStr);
      return { image: image || "", ts: Number.isFinite(ts) ? ts : null, label: (label || "").trim() };
    });
}

async function fetchSessions() {
  const res = await axios.get("https://hackws.austin.kim/api/sessions", { withCredentials: false });
  if (res.status !== 200) throw new Error(`failed to fetch sessions (${res.status})`);
  const data = res.data;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.sessions)) return data.sessions;
  throw new Error("invalid sessions response");
}

async function fetchLogsCsv(sessionId) {
  const url = `https://hackws.austin.kim/api/logs/${encodeURIComponent(sessionId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to fetch logs for ${sessionId} (${res.status})`);
  const data = await res.json();
  if (!data || typeof data.log !== "string") throw new Error(`invalid logs response for ${session_id}`);
  return data.log;
}

function imageUrl(sessionId, imageName) {
  return `https://hackapi.austin.kim/annotated_frames/${encodeURIComponent(sessionId)}/${encodeURIComponent(imageName)}`;
}

const prettyTime = (unixSeconds) => {
  if (!unixSeconds) return "—";
  try { return new Date(unixSeconds * 1000).toLocaleString(); } catch { return String(unixSeconds); }
};

export default function Report() {
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [errorSessions, setErrorSessions] = useState(null);
  const [logsBySession, setLogsBySession] = useState({});
  const [errorsBySession, setErrorsBySession] = useState({});
  const [viewer, setViewer] = useState(null); // { sessionId, image, ts, label } | null

  const pollersRef = useRef({});

  // NEW: detect ?sessionId=... from the URL (query string)
  const forcedSessionId = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get("sessionId");
    return v && v.trim() ? v.trim() : null;
  }, []);

  // Fetch sessions every 5s (SKIP if sessionId is forced)
  useEffect(() => {
    if (forcedSessionId) {
      // lock to the forced session id
      setSessions([forcedSessionId]);
      setLoadingSessions(false);
      setErrorSessions(null);
      return; // do not start the periodic /api/sessions fetcher
    }

    let mounted = true;
    const load = async () => {
      setLoadingSessions(true);
      setErrorSessions(null);
      try {
        const list = await fetchSessions();
        if (mounted) setSessions(list);
      } catch (e) {
        if (mounted) setErrorSessions(e.message || String(e));
      } finally {
        if (mounted) setLoadingSessions(false);
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(t); };
  }, [forcedSessionId]);

  // Poll logs per session every 10s
  useEffect(() => {
    // clear removed sessions
    for (const sid of Object.keys(pollersRef.current)) {
      if (!sessions.includes(sid)) {
        const info = pollersRef.current[sid];
        if (info?.timerId) clearInterval(info.timerId);
        if (info?.abortCtrl) info.abortCtrl.abort();
        delete pollersRef.current[sid];
      }
    }
    // start pollers
    for (const sid of sessions) {
      if (pollersRef.current[sid]) continue;
      const abortCtrl = new AbortController();
      const pull = async () => {
        try {
          const csv = await fetchLogsCsv(sid);
          const rows = parseCsv(csv);
          setLogsBySession((p) => ({ ...p, [sid]: rows }));
          setErrorsBySession((p) => ({ ...p, [sid]: null }));
        } catch (e) {
          setErrorsBySession((p) => ({ ...p, [sid]: e.message || String(e) }));
        }
      };
      pull();
      const timerId = setInterval(pull, 10000);
      pollersRef.current[sid] = { timerId, abortCtrl };
    }
    return () => {
      for (const sid of Object.keys(pollersRef.current)) {
        const info = pollersRef.current[sid];
        if (info?.timerId) clearInterval(info.timerId);
        if (info?.abortCtrl) info.abortCtrl.abort();
      }
      pollersRef.current = {};
    };
  }, [sessions]);

  // Fullscreen viewer wiring
  const fsRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setViewer(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!viewer) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      return;
    }
    const el = fsRef.current;
    if (el && el.requestFullscreen) {
      // el.requestFullscreen().catch(() => {});
    }
  }, [viewer]);

  const activeCount = sessions.length;

  const sessionCards = useMemo(
    () =>
      sessions.map((sid) => {
        const rows = logsBySession[sid] || [];
        const err = errorsBySession[sid] || null;
        return (
          <div key={sid} className="rounded-2xl shadow p-4 border mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">
                Session: <span className="font-mono">{sid}</span>
              </h3>
              <div className="text-sm text-neutral-600">
                {rows.length} rows {err && <span className="text-red-600 ml-2">({err})</span>}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3">Frame</th>
                    <th className="text-left py-2 pr-3">Timestamp</th>
                    <th className="text-left py-2 pr-3">Label</th>
                    <th className="text-left py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-neutral-500">No log entries yet…</td>
                    </tr>
                  ) : (
                    rows.map((r, idx) => (
                      <tr key={`${sid}-${r.image}-${idx}`} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-mono">{r.image}</td>
                        <td className="py-2 pr-3">{prettyTime(r.ts)}</td>
                        <td className="py-2 pr-3">
                          <span className="inline-block rounded-full border px-2 py-0.5">
                            {r.label || "—"}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            className="px-3 py-1 rounded-lg bg-black"
                            onClick={() => setViewer({ sessionId: sid, ...r })}
                            title="View annotated image"
                          >
                            View Image
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }),
    [sessions, logsBySession, errorsBySession]
  );

  return (
    <div className="p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>

        <p className="text-sm text-neutral-600">
          Active sessions: <span className="font-semibold">{loadingSessions ? "…" : activeCount}</span>
        </p>

        {/* If locked to a specific session via query param, show it */}
        {forcedSessionId && (
          <p className="text-xs text-neutral-600 mt-1">
            Showing report for session&nbsp;<span className="font-mono">{forcedSessionId}</span>
          </p>
        )}

        {errorSessions && <p className="text-sm text-red-600 mt-1">Error: {errorSessions}</p>}

        {!forcedSessionId && !!sessions.length && (
          <p className="text-xs text-neutral-600 mt-1">
            {sessions.map((sid, i) => (
              <span key={sid} className="font-mono">
                {sid}
                {i < sessions.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        )}
      </header>

      {sessionCards}

      {viewer && (
        <div
          ref={fsRef}
          className="fixed inset-0 z-50 bg-black"
          onClick={() => setViewer(null)}
        >
          <div
            className="w-screen h-screen flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imageUrl(viewer.sessionId, viewer.image)}
              alt={viewer.image}
              className="max-w-[98vw] max-h-[98vh] object-contain"
            />
            <button
              className="absolute top-4 right-4 px-3 py-1 rounded-lg bg-white/10 border border-white/30"
              onClick={() => setViewer(null)}
              title="Close (Esc)"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
