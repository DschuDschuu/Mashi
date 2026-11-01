import { useRef, useState } from 'react';
import { dismissToast, holdToast, releaseToast, type ToastMessage } from '../toast';

/** ab so viel Weg zählt es als Wegwischen – zur Seite oder nach unten */
const SWIPE = 60;

/**
 * Der Hinweis unten (Julia: „wegwischbar machen“): zur Seite oder nach unten wischen schließt ihn, solange der Finger
 * darauf liegt, bleibt er stehen. Ein Wisch, der auf „Rückgängig“ beginnt, löst den Knopf nicht aus.
 */
export function ToastBar({ message }: { message: ToastMessage }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });

  const end = () => {
    const far = Math.abs(drag.x) > SWIPE || drag.y > SWIPE * 0.7;
    start.current = null;
    setDrag({ x: 0, y: 0 });
    if (far) {
      swiped.current = true;
      dismissToast();
    } else releaseToast();
  };

  return (
    <div
      className={`toast${message.action ? ' toast--action' : ''}`}
      role="status"
      style={drag.x || drag.y ? { transform: `translateX(calc(-50% + ${drag.x}px)) translateY(${Math.max(0, drag.y)}px)`, opacity: Math.max(0.3, 1 - (Math.abs(drag.x) + Math.max(0, drag.y)) / 200) } : undefined}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
        holdToast();
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => { if (start.current) end(); }}
    >
      {message.text}
      {message.action && (
        <button className="toast__action" onClick={() => {
          if (swiped.current) return; // das war ein Wisch, kein Tipp
          message.action!.run();
          dismissToast();
        }}>
          {message.action.label}
        </button>
      )}
    </div>
  );
}
