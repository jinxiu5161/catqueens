import type { Graphics } from 'cc';
import { Color } from 'cc';

function hex(c: string): Color {
  const out = new Color();
  out.fromHEX(c);
  return out;
}

function rgba(r: number, g: number, b: number, a: number): Color {
  return new Color(r, g, b, Math.round(a * 255));
}

/**
 * Draw board piece icons with Graphics (no sprite atlas required).
 * Cat and exclude share similar visual weight so notes read as first-class marks.
 */
export function drawCatIcon(
  g: Graphics,
  cx: number,
  cy: number,
  cell: number,
  fill = '#2A1F14',
  accent = '#F3E6C8',
): void {
  const s = cell * 0.34;
  g.fillColor = hex(fill);
  g.circle(cx, cy - s * 0.05, s * 0.55);
  g.fill();
  g.moveTo(cx - s * 0.55, cy + s * 0.15);
  g.lineTo(cx - s * 0.2, cy + s * 0.75);
  g.lineTo(cx - s * 0.05, cy + s * 0.25);
  g.close();
  g.fill();
  g.moveTo(cx + s * 0.55, cy + s * 0.15);
  g.lineTo(cx + s * 0.2, cy + s * 0.75);
  g.lineTo(cx + s * 0.05, cy + s * 0.25);
  g.close();
  g.fill();
  g.fillColor = hex(accent);
  g.circle(cx - s * 0.2, cy + s * 0.05, s * 0.1);
  g.fill();
  g.circle(cx + s * 0.2, cy + s * 0.05, s * 0.1);
  g.fill();
}

export function drawExcludeIcon(
  g: Graphics,
  cx: number,
  cy: number,
  cell: number,
  stroke = '#1B2A24',
): void {
  const s = cell * 0.28;
  g.fillColor = rgba(27, 42, 36, 0.2);
  g.circle(cx, cy, s * 0.95);
  g.fill();
  g.strokeColor = hex(stroke);
  g.lineWidth = Math.max(3, cell * 0.06);
  g.circle(cx, cy, s * 0.95);
  g.stroke();
  g.moveTo(cx - s * 0.55, cy - s * 0.55);
  g.lineTo(cx + s * 0.55, cy + s * 0.55);
  g.stroke();
  g.moveTo(cx + s * 0.55, cy - s * 0.55);
  g.lineTo(cx - s * 0.55, cy + s * 0.55);
  g.stroke();
}
