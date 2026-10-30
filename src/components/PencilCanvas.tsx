import { getStroke } from "perfect-freehand";
import { useCallback, useEffect, useRef, useState } from "react";

type Point = [number, number, number];
interface Stroke {
  points: Point[];
  color: string;
  size: number;
  simulatePressure: boolean;
}

const COLORS = ["#111111", "#1d4ed8", "#b91c1c", "#15803d"];
const SIZES = [3, 5, 9];

function strokePath(stroke: Stroke): Path2D {
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: stroke.simulatePressure,
  });
  const path = new Path2D();
  if (!outline.length) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1];
    const [x1, y1] = outline[i];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

interface Props {
  onAttach: (image: Blob) => void;
  onClose: () => void;
}

/** Full-screen handwriting area. Works with Apple Pencil, Android styluses, fingers and mice.
 *  Once a stylus is used, finger touches are ignored so a resting palm doesn't draw. */
export default function PencilCanvas({ onAttach, onClose }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const penSeen = useRef(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [count, setCount] = useState(0);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const stroke of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      ctx.fillStyle = stroke.color;
      ctx.fill(strokePath(stroke));
    }
  }, []);

  useEffect(() => {
    const resize = () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [redraw]);

  const position = (e: { clientX: number; clientY: number; pressure: number }, pen: boolean): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top, pen ? e.pressure || 0.5 : 0.5];
  };

  const erase = (x: number, y: number) => {
    const before = strokes.current.length;
    strokes.current = strokes.current.filter((s) => !s.points.some(([px, py]) => Math.hypot(px - x, py - y) < 14));
    if (strokes.current.length !== before) {
      setCount(strokes.current.length);
      redraw();
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "pen") penSeen.current = true;
    if (penSeen.current && e.pointerType === "touch") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pen = e.pointerType === "pen";
    const point = position(e, pen);
    if (tool === "eraser") return erase(point[0], point[1]);
    current.current = { points: [point], color, size, simulatePressure: !pen };
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (penSeen.current && e.pointerType === "touch") return;
    // Only while touching: Apple Pencil hover also sends pointermove, with no buttons pressed.
    if (!(e.buttons & 1)) return;
    const pen = e.pointerType === "pen";
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    if (tool === "eraser") {
      for (const ev of events) {
        const [x, y] = position(ev, pen);
        erase(x, y);
      }
      return;
    }
    if (!current.current) return;
    for (const ev of events) current.current.points.push(position(ev, pen));
    redraw();
  };

  const onPointerUp = () => {
    if (current.current) {
      strokes.current.push(current.current);
      current.current = null;
      setCount(strokes.current.length);
      redraw();
    }
  };

  const undo = () => {
    strokes.current.pop();
    setCount(strokes.current.length);
    redraw();
  };

  const clear = () => {
    strokes.current = [];
    setCount(0);
    redraw();
  };

  /** Renders just the inked area, on white, at 2× for legibility. */
  const attach = () => {
    const all = strokes.current.flatMap((s) => s.points);
    if (!all.length) return onClose();
    const pad = 24;
    const minX = Math.min(...all.map((p) => p[0])) - pad;
    const minY = Math.min(...all.map((p) => p[1])) - pad;
    const maxX = Math.max(...all.map((p) => p[0])) + pad;
    const maxY = Math.max(...all.map((p) => p[1])) + pad;
    const scale = 2;
    const out = document.createElement("canvas");
    out.width = (maxX - minX) * scale;
    out.height = (maxY - minY) * scale;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
    for (const stroke of strokes.current) {
      ctx.fillStyle = stroke.color;
      ctx.fill(strokePath(stroke));
    }
    out.toBlob((blob) => {
      if (blob) onAttach(blob);
      onClose();
    }, "image/png");
  };

  return (
    <div className="overlay" role="dialog" aria-label="Handwriting">
      <div className="overlay-bar">
        <button onClick={onClose}>Cancel</button>
        <div className="segmented">
          <button className={tool === "pen" ? "on" : ""} onClick={() => setTool("pen")}>✏️ Pen</button>
          <button className={tool === "eraser" ? "on" : ""} onClick={() => setTool("eraser")}>🧽 Eraser</button>
        </div>
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${color === c && tool === "pen" ? "on" : ""}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            onClick={() => {
              setColor(c);
              setTool("pen");
            }}
          />
        ))}
        <select value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: "auto" }} aria-label="Pen size">
          {SIZES.map((s) => (
            <option key={s} value={s}>{s === 3 ? "Fine" : s === 5 ? "Medium" : "Bold"}</option>
          ))}
        </select>
        <button onClick={undo} disabled={!count}>↶ Undo</button>
        <button onClick={clear} disabled={!count}>Clear</button>
        <span className="spacer" />
        <button className="primary" onClick={attach} disabled={!count}>Attach</button>
      </div>
      <div className="canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
}
