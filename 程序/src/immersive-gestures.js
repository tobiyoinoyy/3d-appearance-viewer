// Tap opens the model, dragging only rotates it. Track all pointers so a
// pinch or a cancelled gesture cannot become an accidental tap on release.
export class DemoGesture {
  pointers = new Map();
  multi = false;
  startSpan = 0;
  down({ pointerId, clientX, clientY, timeStamp }) {
    this.pointers.set(pointerId, { x: clientX, y: clientY, startX: clientX,
      startY: clientY, time: timeStamp, moved: false });
    if (this.pointers.size > 1) {
      this.multi = true;
      this.startSpan = this.span();
    }
  }
  span() {
    const [a, b] = this.pointers.values();
    return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
  move({ pointerId, clientX, clientY }) {
    const p = this.pointers.get(pointerId);
    if (!p) return false;
    p.x = clientX; p.y = clientY;
    p.moved ||= Math.hypot(p.x - p.startX, p.y - p.startY) > 6;
    return this.multi && this.pointers.size === 2 && this.span() - this.startSpan > 6;
  }
  up({ pointerId, timeStamp }, cancelled = false) {
    const p = this.pointers.get(pointerId);
    const tap = !!p && !cancelled && !p.moved && !this.multi && timeStamp - p.time < 600;
    this.pointers.delete(pointerId);
    if (!this.pointers.size) this.multi = false;
    return tap;
  }
  reset() { this.pointers.clear(); this.multi = false; this.startSpan = 0; }
}
