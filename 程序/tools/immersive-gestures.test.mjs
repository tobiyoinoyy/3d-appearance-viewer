import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoGesture } from '../src/immersive-gestures.js';

const point = (pointerId, clientX, clientY, timeStamp = 0) => ({ pointerId, clientX, clientY, timeStamp });
test('a tap opens, but a rotation returning to its starting point does not', () => {
  const gesture = new DemoGesture();
  gesture.down(point(1, 20, 20));
  assert.equal(gesture.up(point(1, 20, 20, 100)), true);
  gesture.down(point(1, 20, 20));
  gesture.move(point(1, 80, 20));
  gesture.move(point(1, 20, 20));
  assert.equal(gesture.up(point(1, 20, 20, 200)), false);
});
test('pinch outward opens full view; neither finger release becomes a tap', () => {
  const gesture = new DemoGesture();
  gesture.down(point(1, 20, 20));
  gesture.down(point(2, 60, 20));
  assert.equal(gesture.move(point(2, 62, 20)), false);
  assert.equal(gesture.move(point(2, 90, 20)), true);
  assert.equal(gesture.up(point(2, 90, 20, 100)), false);
  assert.equal(gesture.up(point(1, 20, 20, 120)), false);
  gesture.down(point(3, 20, 20, 200));
  assert.equal(gesture.up(point(3, 20, 20, 250)), true);
});
test('inward pinch, long press, pointer cancellation and reset never trigger expansion', () => {
  const gesture = new DemoGesture();
  gesture.down(point(1, 20, 20)); gesture.down(point(2, 80, 20));
  assert.equal(gesture.move(point(2, 50, 20)), false);
  gesture.reset();
  gesture.down(point(1, 20, 20));
  assert.equal(gesture.up(point(1, 20, 20, 900)), false);
  gesture.down(point(1, 20, 20));
  assert.equal(gesture.up(point(1, 20, 20, 100), true), false);
  gesture.down(point(1, 20, 20)); gesture.reset();
  assert.equal(gesture.up(point(1, 20, 20, 100)), false);
});
