import { AnimationMixer, LoopOnce } from 'three';

// Only models carrying our lid metadata opt into this control.
export function createLaptopLidController(gltf) {
  const root = gltf.scene;
  const metadata = root?.userData?.laptop_lid;
  const clip = gltf.animations?.find((item) => item.name === metadata?.open_clip);
  if (!metadata || !clip || !(clip.duration > 0)) return null;
  const mixer = new AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  let targetOpen = metadata.initial_state === 'open';
  action.time = targetOpen ? clip.duration : 0;
  action.play();
  action.paused = true;
  mixer.update(0);
  return {
    get targetOpen() { return targetOpen; },
    get moving() { return !action.paused; },
    toggle() {
      targetOpen = !targetOpen;
      // Reverse the current playhead, preserving the exact in-between pose.
      action.enabled = true;
      action.paused = false;
      action.setEffectiveTimeScale(targetOpen ? 1 : -1);
      action.play();
    },
    update(seconds) { mixer.update(Math.max(0, Math.min(seconds, 0.1))); },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); },
  };
}
