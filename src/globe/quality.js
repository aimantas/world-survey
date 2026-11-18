// GPU / screen tiering. 'auto' resolves to 'high' or 'low'; `strong` unlocks the 8k relief.
// Parameters are derived from (tier, mobile) so a phone on 'high' still gets a lighter mesh.

export function detectDevice(gl) {
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { gpu = 'unknown'; }
  const ua = navigator.userAgent || '';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width || 9999, screen.height || 9999) < 820;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (coarse && small);
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
  const mem = navigator.deviceMemory || 0; // Chrome only; 0 = unknown
  const software = /SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu);
  const weakGpu = /Mali-[2-4]\d\d|Mali-T|Adreno \(TM\) [2-5]\d\d|PowerVR SGX|Intel.*HD Graphics [2-5]\d{2,3}\b|GMA/i.test(gpu);
  const low = software || weakGpu || (mem && mem <= 2);
  const strong = !mobile && !low && maxTex >= 8192 &&
    (/Apple M\d|NVIDIA|GeForce|RTX|Quadro|Radeon (RX|Pro)|Arc\(TM\) A/i.test(gpu) ||
      (/Apple GPU/i.test(gpu) && (navigator.hardwareConcurrency || 0) >= 8));
  return { gpu, mobile, maxTex, low, strong, software };
}

export function qualityParams(tier, device) {
  const high = tier === 'high';
  const mobile = device.mobile;
  const dprCap = mobile ? 1.5 : (high ? 2 : 1.5);
  return {
    tier,
    dprCap,
    sphereN: high ? (mobile ? 112 : 176) : 80,        // cube-sphere cells per face edge
    indexW: high && !mobile ? 4096 : 2048,             // country index map width (2:1)
    maskW: high ? (device.strong ? 8192 : 4096) : 4096, // AA land mask width (2:1)
    maskPasses: high ? 8 : 4,                           // jittered coverage passes
    paletteTaps: high,                                  // 4-tap smoothed survey/hover edges
    bicubicSdf: high,                                   // smooth water lines
    reliefMax: !high ? 2 : device.strong ? 8 : mobile ? 4 : 4, // max relief tier in k
    reliefEager4k: high && !mobile,                     // desktop upgrades right after first frame
    elevLod: high ? 1.6 : 2.2,                          // vertex displacement smoothing
    detail: high,                                       // regional 2.2 km elevation tiles when zoomed in
    detailSlots: mobile ? [4, 8] : [8, 8],              // atlas slots (512 px tiles): 32 on phones, 64 desktop
    micro: high && !mobile,                             // procedural rock micro-relief
    anisotropy: high ? 16 : 4,                          // cap for relief / elevation / mask (tilted views)
  };
}
