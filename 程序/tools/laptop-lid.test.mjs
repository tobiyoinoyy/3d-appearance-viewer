import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Object3D, AnimationClip, QuaternionKeyframeTrack, Quaternion } from 'three';
import { createLaptopLidController } from '../src/laptop-lid.js';

const raw = readFileSync(new URL('../../模型/MacBookTest-开合动画.glb', import.meta.url));
const jsonLength = raw.readUInt32LE(12);
const doc = JSON.parse(raw.subarray(20, 20 + jsonLength));
const binary = raw.subarray(28 + jsonLength);
function floats(index) {
  const a = doc.accessors[index], view = doc.bufferViews[a.bufferView];
  const count = a.count * (a.type === 'VEC4' ? 4 : 1);
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  return Array.from({ length: count }, (_, i) => binary.readFloatLE(start + i * 4));
}
const exportedClip = doc.animations.find((clip) => clip.name === 'Laptop_Open');
const sampler = exportedClip.samplers[0];
const times = floats(sampler.input), values = floats(sampler.output);
const start = new Quaternion().fromArray(values, 0);
const end = new Quaternion().fromArray(values, values.length - 4);
function fixture() {
  const scene = new Object3D(), lid = new Object3D();
  scene.add(lid); lid.quaternion.copy(end);
  scene.userData = doc.scenes[doc.scene || 0].extras;
  const track = new QuaternionKeyframeTrack(`${lid.uuid}.quaternion`, times, values);
  const clip = new AnimationClip('Laptop_Open', -1, [track]);
  return { scene, lid, animations: [clip] };
}
function advance(control, seconds) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.02) control.update(0.02);
}
function near(a, b) { assert.ok(a.clone().normalize().angleTo(b.clone().normalize()) < 0.0001); }

test('exported clips only rotate the lid hinge and span closed to 110 degrees', () => {
  assert.deepEqual(doc.animations.map((a) => a.name), ['Laptop_Open', 'Laptop_Close']);
  for (const clip of doc.animations) {
    assert.equal(clip.channels.length, 1);
    assert.equal(clip.channels[0].target.path, 'rotation');
    assert.equal(doc.nodes[clip.channels[0].target.node].name, '屏幕开合 • 修改 opening_degrees');
  }
  assert.ok(Math.abs(start.angleTo(end) * 180 / Math.PI - 110) < 0.001);
});
test('unrelated phones and unsupported files have no lid control', () => {
  assert.equal(createLaptopLidController({ scene: new Object3D(), animations: [] }), null);
  const f = fixture(); f.animations = [];
  assert.equal(createLaptopLidController(f), null);
});
test('actual exported animation starts open, clamps closed, and reopens', () => {
  const f = fixture(), control = createLaptopLidController(f);
  near(f.lid.quaternion, end);
  control.toggle(); advance(control, 2);
  near(f.lid.quaternion, start); assert.equal(control.moving, false);
  advance(control, 3); near(f.lid.quaternion, start);
  control.toggle(); advance(control, 2);
  near(f.lid.quaternion, end); assert.equal(control.moving, false);
});
test('reversing mid-motion does not jump or reset the hinge', () => {
  const f = fixture(), control = createLaptopLidController(f);
  control.toggle(); advance(control, 0.4);
  const middle = f.lid.quaternion.clone(), distance = middle.angleTo(end);
  assert.ok(distance > 0.01 && distance < start.angleTo(end));
  control.toggle(); near(f.lid.quaternion, middle);
  control.update(0.02); assert.ok(f.lid.quaternion.angleTo(end) < distance);
  for (let i = 0; i < 20; i++) {
    const before = f.lid.quaternion.clone(); control.toggle(); near(f.lid.quaternion, before);
    control.update(0.03);
    assert.ok(f.lid.quaternion.angleTo(end) <= start.angleTo(end) + 0.0001);
  }
  advance(control, 2); near(f.lid.quaternion, end);
});
test('unloading releases animation bindings and subsequent updates are inert', () => {
  const f = fixture(), control = createLaptopLidController(f);
  control.toggle(); advance(control, 0.4); control.dispose();
  const pose = f.lid.quaternion.clone(); advance(control, 2); near(f.lid.quaternion, pose);
});
