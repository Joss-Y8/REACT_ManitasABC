// src/hooks/useTimedSignPredictor.js
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as tf from "@tensorflow/tfjs";

/* --- parámetros --- */
const MIN_CONF = 0.65;
const STABLE_N = 5;
const COUNTDOWN_SEC = 3;
const WINDOW_MS = 2000;
const INFER_EVERY_MS = 100;

/* --- helpers --- */
function dist2D(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  return Math.hypot(dx, dy);
}
function preprocessLandmarks(lm21) {
  const base = lm21[0];
  const ref = lm21[9] || lm21[12] || lm21[5] || lm21[17] || base;
  let scale = dist2D(base, ref);
  if (!isFinite(scale) || scale < 1e-6) scale = 1.0;

  const feat = new Float32Array(63);
  for (let i = 0; i < 21; i++) {
    const p = lm21[i] || { x: 0, y: 0, z: 0 };
    const nx = (p.x - base.x) / scale;
    const ny = (p.y - base.y) / scale;
    const nz = (p.z - base.z) / scale;
    feat[i * 3 + 0] = nx; feat[i * 3 + 1] = ny; feat[i * 3 + 2] = nz;
  }
  return feat;
}

/**
 * useTimedSignPredictor({ targetLetter?, onFinalResult? })
 */
export default function useTimedSignPredictor(options = {}) {
  const targetLetter = options.targetLetter || null;
  const onFinalResult = options.onFinalResult || null;

  const handleResultsRef = useRef(null);
  const restartRef = useRef(() => {});

  const modelRef = useRef(null);
  const labelsRef = useRef([]);
  const meanRef = useRef(null);
  const scaleRef = useRef(null);

  const phaseRef = useRef("idle");
  const readyRef = useRef(false);
  const lastInferTsRef = useRef(0);
  const timerIntervalRef = useRef(null);
  const timerTimeoutRef = useRef(null);
  const startTimeRef = useRef(0);

  const sumRef = useRef(null);
  const countRef = useRef(0);

  const stableHitsRef = useRef(0);
  const lastWinnerRef = useRef(null);

  const [phase, setPhase] = useState("idle");
  const [countdown, setCountdown] = useState(0);
  const [ready, setReady] = useState(false);
  const [hasHand, setHasHand] = useState(false);
  const [pred, setPred] = useState({ label: "-", prob: 0, all: [], targetScore: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedRatio, setElapsedRatio] = useState(0);

  const setPhaseSafe = useCallback((p) => { phaseRef.current = p; setPhase(p); }, []);
  const setReadySafe = useCallback((r) => { readyRef.current = r; setReady(r); }, []);
  const setHasHandSafe = useCallback((h) => setHasHand(h), []);

  /* ---------------------------
     CARGA MODELO + LABELS + SCALER
     --------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [model, labels] = await Promise.all([
          tf.loadLayersModel("/model/model.json"),
          fetch("/model/labels.json").then((r) => r.json()),
        ]);
        if (!alive) return;
        modelRef.current = model;
        labelsRef.current = Array.isArray(labels) ? labels : [];

        try {
          const [mean, scale] = await Promise.all([
            fetch("/model/scaler_mean.json").then((r) => (r.ok ? r.json() : null)),
            fetch("/model/scaler_scale.json").then((r) => (r.ok ? r.json() : null)),
          ]);
          if (mean && scale && mean.length === 63 && scale.length === 63) {
            meanRef.current = Float32Array.from(mean);
            scaleRef.current = Float32Array.from(scale);
          }
        } catch (e) {
          // scaler opcional
        }

        setReadySafe(true);
      } catch (e) {
        console.error("Error cargando modelo/labels:", e);
      }
    })();
    return () => { alive = false; };
  }, [setReadySafe]);

  const predictFromLm = useCallback((lm21) => {
    if (!modelRef.current || !lm21 || lm21.length !== 21) return null;
    const feat = preprocessLandmarks(lm21);

    if (meanRef.current && scaleRef.current) {
      for (let i = 0; i < 63; i++) {
        const sc = scaleRef.current[i] || 1.0;
        feat[i] = (feat[i] - (meanRef.current[i] || 0)) / sc;
      }
    }

    const probs = tf.tidy(() => {
      const input = tf.tensor2d(feat, [1, 63]);
      const logits = modelRef.current.predict(input);
      return tf.softmax(logits).dataSync();
    });
    return probs;
  }, []);

  const clearTimers = useCallback(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    if (timerTimeoutRef.current) { clearTimeout(timerTimeoutRef.current); timerTimeoutRef.current = null; }
  }, []);

  const restart = useCallback(() => {
    clearTimers();
    sumRef.current = null; countRef.current = 0; lastInferTsRef.current = 0;
    stableHitsRef.current = 0; lastWinnerRef.current = null;
    setPred({ label: "-", prob: 0, all: [], targetScore: 0 });
    setCountdown(0);
    setElapsedRatio(0);
    startTimeRef.current = 0;
    setPhaseSafe("idle");
    setIsPaused(false);
  }, [clearTimers, setPhaseSafe]);

  const handleResults = useMemo(() => {
    return (results) => {
      if (phaseRef.current === "done") {
        setHasHandSafe(false);
        return;
      }

      const detected = !!(results?.multiHandLandmarks && results.multiHandLandmarks.length > 0);
      setHasHandSafe(detected);
      if (!readyRef.current || !modelRef.current) return;

      if (detected) {
        const lm21 = results.multiHandLandmarks[0];

        if (phaseRef.current === "idle") {
          setPhaseSafe("countdown");
          setCountdown(COUNTDOWN_SEC);
          clearTimers();
          sumRef.current = null; countRef.current = 0; lastInferTsRef.current = 0;
          stableHitsRef.current = 0; lastWinnerRef.current = null;

          // countdown interval (1s)
          timerIntervalRef.current = setInterval(() => {
            setCountdown((prev) => {
              const next = prev - 1;
              // **actualizamos elapsedRatio DURANTE countdown** -> valor entre 0..1
              // cuando next = prev-1 ; we want fraction of progress done
              const done = COUNTDOWN_SEC - Math.max(next, 0);
              setElapsedRatio(done / COUNTDOWN_SEC);

              if (next <= 0) {
                clearTimers();
                setPhaseSafe("analyzing");
                sumRef.current = null; countRef.current = 0; lastInferTsRef.current = 0;
                stableHitsRef.current = 0; lastWinnerRef.current = null;

                startTimeRef.current = performance.now();
                setElapsedRatio(0); // resetting to 0 for analyzing progress

                // tiempo para recolectar ventanas de inferencia
                timerTimeoutRef.current = setTimeout(() => {
                  if (sumRef.current && countRef.current > 0) {
                    const avg = sumRef.current.map((v) => v / countRef.current);
                    let maxIdx = 0, maxVal = avg[0];
                    for (let i = 1; i < avg.length; i++) if (avg[i] > maxVal) { maxVal = avg[i]; maxIdx = i; }

                    const labels = labelsRef.current || [];
                    const passThreshold = maxVal >= MIN_CONF;
                    const passStability = stableHitsRef.current >= STABLE_N;

                    const topLabel = labels[maxIdx] ?? `${maxIdx}`;
                    const targetIdx = targetLetter
                      ? labels.findIndex(l => (l || "").toLowerCase() === targetLetter.toLowerCase())
                      : -1;
                    const tScore = targetIdx >= 0 ? Math.round((avg[targetIdx] || 0) * 100) : 0;

                    const finalLabel = (passThreshold && passStability) ? topLabel : "Desconocido";
                    const finalProb  = Math.round(maxVal * 100);

                    const payload = {
                      label: finalLabel,
                      prob: finalProb,
                      all: avg.map((p, i) => ({ label: labels[i] ?? `${i}`, p }))
                              .sort((a, b) => b.p - a.p),
                      targetScore: tScore,
                      targetLetter: targetLetter,
                      isMatch: targetLetter
                        ? (finalLabel.toLowerCase() === targetLetter.toLowerCase())
                        : null
                    };

                    setPred(payload);
                    setPhaseSafe("done");
                    setIsPaused(true);

                    setTimeout(() => {
                      try { onFinalResult && onFinalResult(payload); } catch {}
                    }, 100);
                  } else {
                    setPhaseSafe("idle");
                  }
                }, WINDOW_MS);

                return 0;
              }
              return next;
            });
          }, 1000);
        }

        if (phaseRef.current === "analyzing") {
          const now = performance.now();
          if (!lastInferTsRef.current || now - lastInferTsRef.current > INFER_EVERY_MS) {
            lastInferTsRef.current = now;
            const probs = predictFromLm(lm21);
            if (probs) {
              if (!sumRef.current) sumRef.current = Array.from(probs);
              else for (let i = 0; i < probs.length; i++) sumRef.current[i] += probs[i];
              countRef.current += 1;

              let maxIdx = 0, maxVal = probs[0];
              for (let i = 1; i < probs.length; i++) if (probs[i] > maxVal) { maxVal = probs[i]; maxIdx = i; }
              if (maxVal >= MIN_CONF) {
                if (lastWinnerRef.current === maxIdx) stableHitsRef.current += 1;
                else { lastWinnerRef.current = maxIdx; stableHitsRef.current = 1; }
              }
            }
          }
        }
      } else {
        if (phaseRef.current !== "idle" && !isPaused) {
          setPhaseSafe("idle");
          setCountdown(0);
          sumRef.current = null; countRef.current = 0; lastInferTsRef.current = 0;
          stableHitsRef.current = 0; lastWinnerRef.current = null;
          clearTimers();
        }
      }
    };
  }, [clearTimers, predictFromLm, setHasHandSafe, setPhaseSafe, targetLetter, onFinalResult, isPaused]);

  /* 🔥 actualiza refs que CameraPage espera (mover después de handleResults y restart) */
  useEffect(() => {
    handleResultsRef.current = handleResults;
    restartRef.current = restart;
  }, [handleResults, restart]);

  /* ---------------------------
     Animación progresiva: elapsedRatio mientras se analiza
     - Este RAF loop solo escribe elapsedRatio DURANTE la fase 'analyzing'.
     - No toca elapsedRatio en otras fases (así no pisa el countdown).
     --------------------------- */
  useEffect(() => {
    let animId = null;
    const updateProgress = () => {
      if (phaseRef.current === "analyzing") {
        const elapsed = performance.now() - startTimeRef.current;
        const ratio = Math.min(1.0, elapsed / WINDOW_MS);
        setElapsedRatio(ratio);
      }
      animId = requestAnimationFrame(updateProgress);
    };
    animId = requestAnimationFrame(updateProgress);
    return () => { if (animId) cancelAnimationFrame(animId); };
  }, []); // <-- vacío: loop lee phaseRef.current internamente

  const ResultModal = useCallback(() => {
    if (phase !== "done") return null;
    //const points = Math.max(0, Math.min(100, pred.prob || 0));
    const mismatch = targetLetter && pred.label !== "Desconocido" &&
                     pred.label?.toLowerCase() !== targetLetter?.toLowerCase();

    const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999, padding:16 };
    const modal = { width:"min(560px,92vw)", background:"white", borderRadius:16, boxShadow:"0 12px 40px rgba(0,0,0,.25)", padding:24, textAlign:"center" };
    const headline = { fontSize:28, margin:"8px 0 4px" };
    //const bigScore = { fontSize:56, margin:"0 0 12px", lineHeight:1.1 };
    const sub = { color:"#555", marginBottom:12 };
    const errorBox = { background: 'linear-gradient(135deg, #ffe871, #fff2b2ff)', border:"2px solid #ffe871", color:"#ff6600ff", padding:"20px 16px", borderRadius:12, marginBottom:16, fontWeight:600, fontSize:18 };

    //const dotsWrap = { margin:"14px auto 18px", display:"grid", gridTemplateColumns:"repeat(20,1fr)", gap:6, width:"min(520px,90vw)" };
    //const dot = (active) => ({ width:14, height:14, borderRadius:4, background: active ? "#0ac5e7ff" : "#e5defb", transition:"background .2s ease" });
    const btn = { marginTop:8, padding:"10px 16px", borderRadius:10, border:"none", background:"#0ac5e7ff", color:"white", fontSize:16, cursor:"pointer" };

    if (mismatch) {
      return (
        <div style={overlay} role="dialog" aria-modal="true">
          <div style={modal}>
            <div style={headline}>¡Ups!</div>
            <div style={errorBox}>
              ¡Cuidado! Debes realizar la seña de la letra <strong>{targetLetter}</strong>
            </div>
            <div style={sub}>
              Detectamos la letra: <strong>{pred.label}</strong>
            </div>
            <button style={btn} onClick={restart}>Volver a intentar</button>
          </div>
        </div>
      );
    }
  }, [phase, pred, restart, targetLetter]);

  const Badge = useCallback(() => {
    return (
      <div style={{ marginTop:12, padding:12, borderRadius:12, background:"#e9d0ff", color:"#3a2159", fontWeight:600, maxWidth:480 }}>
        <div>Estado modelo: <strong>{ready ? "Listo" : "Cargando..."}</strong></div>
        <div>Mano: <strong>{hasHand ? "Detectada" : "Sin mano"}</strong></div>
        {phase === "countdown" && <div>Capturando en {countdown}s…</div>}
        {phase === "analyzing" && <div>Analizando…</div>}
      </div>
    );
  }, [ready, hasHand, phase, countdown]);

  return { Badge, ResultModal, handleResults, pred, phase, ready, restart, elapsedRatio, TIME_LIMIT_MS: WINDOW_MS };
}
