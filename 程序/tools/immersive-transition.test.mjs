import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const source = readFileSync(new URL('../src/immersive-demo.js', import.meta.url), 'utf8');
// Exercise the production camera/layout transition with deterministic timestamps.
const functions = ['fit', 'rebuildControls', 'resize', 'setExpanded', 'animateTransition', 'render'].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  }', start) + 4;
  return source.slice(start, end);
}).join('\n');

for (const direction of [new THREE.Vector3(.3, .1, 1), new THREE.Vector3(-.4, -.1, -1)]) {
  test(`closing a heavily zoomed ${direction.z > 0 ? 'back' : 'front'} view keeps its angle and retreats safely`, () => {
    const root = new THREE.Mesh(new THREE.BoxGeometry(1, 2, .1));
    const camera = new THREE.PerspectiveCamera(32, 390 / 844, .001, 100);
    camera.position.copy(direction.normalize()).multiplyScalar(.5);
    const initialDirection = camera.position.clone().normalize();
    const target = new THREE.Vector3();
    camera.lookAt(target);
    const originalQuaternion = camera.quaternion.clone();
    const host = { style: {}, setAttribute() {}, focus() {}, addEventListener() {}, removeEventListener() {},
      getRootNode() { return this; } };
    const controls = new OrbitControls(camera, host);
    // Reproduce a closing action arriving with unfinished controller input.
    controls._sphericalDelta.theta = .3;
    controls._sphericalDelta.phi = -.1;
    const sizes = [];
    const context = vm.createContext({
      THREE, OrbitControls, camera, controls, model: root,
      state: { modelRoot: root, scene: new THREE.Scene(), renderer: {
        setSize: (w, h) => sizes.push([w, h]), setClearAlpha() {}, render() {
          assert.ok(1 - Math.abs(camera.quaternion.dot(originalQuaternion)) < 1e-10,
            'every rendered frame must keep the closing orientation');
        },
      } },
      gestures: { reset() {} }, select: {}, skuSelect: {}, previousAlpha: 1,
      renderLayer: { getBoundingClientRect: () => ({ width: 390, height: 844 }) },
      host,
      phone: { classList: { toggle() {} } }, close: {},
      rememberSize() {}, matchMedia: () => ({ matches: false }),
      performance: { now: () => context.time }, time: 0,
    });
    vm.runInContext(`let active = true, expanded = true, transition = null;
      let frameOffset = .04, fitDistance = 1;
      ${functions}
      setExpanded(false);`, context);
    let previousDistance = .5;
    for (let time = 0; time <= 480; time += 16) {
      context.time = time;
      vm.runInContext('render()', context);
      const offset = camera.position.clone().sub(target);
      assert.ok(offset.length() >= previousDistance - 1e-8, 'camera must not pass through the phone');
      assert.ok(offset.normalize().distanceTo(initialDirection) < 1e-8, 'closing must retain the rotated view');
      previousDistance = camera.position.distanceTo(target);
    }
    assert.ok(sizes.every(([w, h]) => w === 390 && h === 844), 'canvas stays full-screen during collapse');
    assert.equal(vm.runInContext('transition', context), null);
    assert.ok(Math.abs(camera.view.offsetY / 844 - .246) < 1e-8);
    assert.equal(context.controls.enabled, true);
  });
}
