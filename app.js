const $ = selector => document.querySelector(selector);

const REQUIRED_LAYERS = [
  "head", "torso", "pelvis",
  "left_upper_arm", "left_forearm", "left_hand",
  "right_upper_arm", "right_forearm", "right_hand",
  "left_thigh", "left_calf", "left_foot",
  "right_thigh", "right_calf", "right_foot"
];
const OPTIONAL_LAYERS = [
  "hair_back", "hair_front", "left_ponytail", "right_ponytail",
  "skirt_back", "skirt_front", "accessory"
];
const DRAW_ORDER = [
  "hair_back", "skirt_back",
  "left_thigh", "right_thigh", "left_calf", "right_calf", "left_foot", "right_foot",
  "torso", "pelvis",
  "left_upper_arm", "right_upper_arm", "left_forearm", "right_forearm", "left_hand", "right_hand",
  "head", "hair_front", "left_ponytail", "right_ponytail", "skirt_front", "accessory"
];

const folderInput = $("#character-folder");
const folderTitle = $("#folder-title");
const folderDetail = $("#folder-detail");
const layerGrid = $("#layer-grid");
const validationSummary = $("#validation-summary");
const validationProgress = $("#validation-progress");
const validationErrors = $("#validation-errors");
const loadDemo = $("#load-demo");
const loadShortDemo = $("#load-short-demo");
const previewRigButton = $("#preview-rig");
const characterCanvas = $("#character-canvas");
const compositionCanvas = $("#composition-canvas");
const characterSizeInput = $("#character-size");
const characterSizeValue = $("#character-size-value");
const resetLayoutButton = $("#reset-layout");
const layoutHint = $("#layout-hint");
const sampleCharacter = $("#sample-character");
const studioState = $("#studio-state");
const stageNote = $("#stage-note");
const primaryAction = $("#primary-action");
const hint = $("#hint");
const motionInput = $("#motion-input");
const motionName = $("#motion-name");
const motionMeta = $("#motion-meta");
const referenceWrap = $("#reference-wrap");
const referenceVideo = $("#reference-video");
const poseCanvas = $("#pose-canvas");
const poseState = $("#pose-state");
const exportAction = $("#export-action");
const exportResult = $("#export-result");
const exportCanvas = document.createElement("canvas");

let characterReady = false;
let motionReady = false;
let layerBitmaps = new Map();
let motionUrl = "";
let poseLandmarker = null;
let tracking = false;
let videoFrameCallback = null;
let rigJoints = null;
let rigManifestError = "";
let smoothedPose = null;
let poseCalibration = null;
let demoAnimationFrame = null;
let mediaRecorder = null;
let exportChunks = [];
let exporting = false;
let exportCancelled = false;
let exportProgressTimer = null;
let exportUrl = "";
let facingBack = false;
let facingBackConfidence = 0;
let layoutDragging = false;
const characterLayout = { x:.5, y:.53, size:.72 };
const layoutDragOffset = { x:0, y:0 };
const limbCompositeCanvases = new Map();

exportCanvas.width = 720;
exportCanvas.height = 1080;
compositionCanvas.width = exportCanvas.width;
compositionCanvas.height = exportCanvas.height;

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODULE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const DEMO_ASSET_VERSION = "24";
const CONNECTIONS = [
  [0,7],[0,8],[7,8],[11,12],[11,13],[13,15],[12,14],[14,16],
  [15,17],[15,19],[16,18],[16,20],[11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32]
];
const DEFAULT_JOINTS = {
  head:[.5,.2], neck:[.5,.32],
  leftShoulder:[.58,.36], leftElbow:[.64,.5], leftWrist:[.66,.64],
  rightShoulder:[.42,.36], rightElbow:[.36,.5], rightWrist:[.34,.64],
  leftHip:[.54,.59], leftKnee:[.55,.76], leftAnkle:[.56,.92],
  rightHip:[.46,.59], rightKnee:[.45,.76], rightAnkle:[.44,.92]
};
const POSE_INDEX = {
  nose:0, leftEar:7, rightEar:8,
  leftShoulder:11, rightShoulder:12,
  leftElbow:13, rightElbow:14,
  leftWrist:15, rightWrist:16,
  leftIndex:19, rightIndex:20,
  leftHip:23, rightHip:24,
  leftKnee:25, rightKnee:26,
  leftAnkle:27, rightAnkle:28,
  leftHeel:29, rightHeel:30,
  leftFoot:31, rightFoot:32
};

function normalizeLayerName(filename) {
  return filename
    .split("/").pop()
    .replace(/\.png$/i, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function renderLayerChecklist(found = new Set()) {
  layerGrid.innerHTML = "";
  for (const layer of REQUIRED_LAYERS) {
    const item = document.createElement("span");
    const exists = found.has(layer);
    item.className = exists ? "found" : "missing";
    item.innerHTML = `<i>${exists ? "✓" : "○"}</i>${layer}`;
    layerGrid.append(item);
  }
}

function showValidationErrors(errors) {
  validationErrors.innerHTML = "";
  validationErrors.classList.toggle("hidden", errors.length === 0);
  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = error;
    validationErrors.append(item);
  }
}

async function readBitmap(file) {
  const bitmap = await createImageBitmap(file);
  const sampleSize = 128;
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently:true });
  sampleContext.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
  const pixels = sampleContext.getImageData(0, 0, sampleSize, sampleSize).data;
  let transparentPixels = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 250) transparentPixels += 1;
  }
  return {
    file,
    bitmap,
    width:bitmap.width,
    height:bitmap.height,
    transparentRatio:transparentPixels / (sampleSize * sampleSize)
  };
}

function setRigManifest(manifest) {
  const joints = manifest?.joints;
  const required = Object.keys(DEFAULT_JOINTS);
  if (!joints || required.some(name => !Array.isArray(joints[name]) || joints[name].length !== 2)) {
    rigJoints = { ...DEFAULT_JOINTS };
    rigManifestError = "manifest.json 缺少完整关节坐标，已使用通用骨架模板。";
    return;
  }
  rigJoints = Object.fromEntries(required.map(name => [
    name,
    joints[name].map(value => Number(value))
  ]));
  rigManifestError = "";
}

async function loadRigManifestFromFiles(files) {
  const manifestFile = files.find(file =>
    (file.webkitRelativePath || file.name).split("/").pop().toLowerCase() === "manifest.json"
  );
  if (!manifestFile) {
    setRigManifest({ joints:DEFAULT_JOINTS });
    rigManifestError = "未找到 manifest.json，当前使用通用骨架模板。";
    return;
  }
  try {
    setRigManifest(JSON.parse(await manifestFile.text()));
  } catch (error) {
    console.error(error);
    setRigManifest(null);
    rigManifestError = "manifest.json 无法解析，已使用通用骨架模板。";
  }
}

async function validateCharacterFolder(files) {
  const pngFiles = files.filter(file => file.name.toLowerCase().endsWith(".png"));
  const recognized = new Map();
  const duplicates = new Set();
  for (const file of pngFiles) {
    const name = normalizeLayerName(file.webkitRelativePath || file.name);
    if (![...REQUIRED_LAYERS, ...OPTIONAL_LAYERS].includes(name)) continue;
    if (recognized.has(name)) duplicates.add(name);
    recognized.set(name, file);
  }

  renderLayerChecklist(new Set(recognized.keys()));
  validationProgress.style.width = `${Math.round(REQUIRED_LAYERS.filter(name => recognized.has(name)).length / REQUIRED_LAYERS.length * 100)}%`;
  const errors = [];
  const missing = REQUIRED_LAYERS.filter(name => !recognized.has(name));
  if (missing.length) errors.push(`缺少 ${missing.length} 个必需图层：${missing.join("、")}`);
  if (duplicates.size) errors.push(`存在重复命名：${[...duplicates].join("、")}`);
  if (!recognized.size) errors.push("文件夹中没有识别到符合命名规范的 PNG 图层。");

  let decoded = [];
  try {
    decoded = await Promise.all([...recognized].map(async ([name, file]) => [name, await readBitmap(file)]));
  } catch (error) {
    console.error(error);
    errors.push("至少有一张 PNG 无法解码，请重新导出素材。");
  }

  if (decoded.length) {
    const [{ width, height }] = decoded.map(([, data]) => data);
    const mismatched = decoded.filter(([, data]) => data.width !== width || data.height !== height).map(([name]) => name);
    const opaque = decoded.filter(([, data]) => data.transparentRatio < .02).map(([name]) => name);
    if (mismatched.length) errors.push(`图层画布尺寸不一致：${mismatched.join("、")}`);
    if (opaque.length) errors.push(`图层缺少透明背景：${opaque.join("、")}`);
    if (width < 1024 || height < 1024) errors.push(`画布为 ${width}×${height}，低于规范要求的 1024×1024。`);
  }
  if (rigManifestError) errors.push(rigManifestError);

  showValidationErrors(errors);
  const blockingErrors = errors.filter(error => !error.includes("通用骨架模板"));
  characterReady = blockingErrors.length === 0;
  if (!characterReady) {
    for (const [, data] of decoded) data.bitmap.close();
    validationSummary.textContent = `未通过 · ${errors.length} 项问题`;
    validationSummary.className = "error";
    studioState.textContent = "素材待修正";
    previewRigButton.disabled = true;
    characterSizeInput.disabled = true;
    resetLayoutButton.disabled = true;
    updatePrimaryAction();
    updateExportAction();
    return;
  }

  for (const data of layerBitmaps.values()) data.bitmap.close();
  layerBitmaps = new Map(decoded);
  limbCompositeCanvases.clear();
  validationSummary.textContent = `通过 · ${decoded.length} 个图层`;
  validationSummary.className = "success";
  validationProgress.style.width = "100%";
  folderDetail.textContent = `${decoded.length} 个图层 · ${decoded[0][1].width}×${decoded[0][1].height}`;
  previewRigButton.disabled = false;
  characterSizeInput.disabled = false;
  resetLayoutButton.disabled = false;
  renderCharacterComposite();
  updatePrimaryAction();
  updateExportAction();
}

function renderCharacterComposite() {
  if (!layerBitmaps.size) return;
  const first = layerBitmaps.values().next().value;
  characterCanvas.width = first.width;
  characterCanvas.height = first.height;
  const context = characterCanvas.getContext("2d");
  context.clearRect(0, 0, characterCanvas.width, characterCanvas.height);
  for (const name of DRAW_ORDER) {
    const layer = layerBitmaps.get(name);
    if (layer) context.drawImage(layer.bitmap, 0, 0);
  }
  sampleCharacter.classList.add("hidden");
  compositionCanvas.classList.remove("hidden");
  stageNote.innerHTML = "<strong>合成舞台已就绪</strong><small>拖动纸片人调整位置，使用下方滑杆调整大小</small>";
  studioState.textContent = "角色绑定完成";
  hint.textContent = "角色已按关节配置完成绑定。现在导入真人动作视频，即可驱动头、手臂、腿和脚。";
  renderLayoutPreview();
  renderExportFrame();
}

folderInput.addEventListener("change", async event => {
  const files = [...event.target.files];
  if (!files.length) return;
  resetRigTracking();
  const folder = files[0].webkitRelativePath?.split("/")[0] || "纸片人素材";
  folderTitle.textContent = folder;
  folderDetail.textContent = `正在检查 ${files.length} 个文件…`;
  validationSummary.textContent = "检查中";
  await loadRigManifestFromFiles(files);
  await validateCharacterFolder(files);
});

async function loadBuiltInCharacter(button, { path, title, optionalLayers = [] }) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "正在加载…";
  folderTitle.textContent = title;
  folderDetail.textContent = "正在读取项目内置分层素材…";
  validationSummary.textContent = "检查中";
  try {
    resetRigTracking();
    const manifestResponse = await fetch(`${path}/manifest.json?v=${DEMO_ASSET_VERSION}`, { cache:"reload" });
    if (!manifestResponse.ok) throw new Error("无法读取演示角色 manifest.json");
    setRigManifest(await manifestResponse.json());
    const names = [...REQUIRED_LAYERS, ...optionalLayers];
    const files = await Promise.all(names.map(async name => {
      const response = await fetch(`${path}/${name}.png?v=${DEMO_ASSET_VERSION}`, { cache:"reload" });
      if (!response.ok) throw new Error(`无法读取 ${name}.png`);
      return new File([await response.blob()], `${name}.png`, { type:"image/png" });
    }));
    await validateCharacterFolder(files);
  } catch (error) {
    console.error(error);
    showValidationErrors(["内置演示资源读取失败，请通过本地服务运行项目后重试。"]);
    validationSummary.textContent = "演示资源读取失败";
    validationSummary.className = "error";
    updateExportAction();
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

loadDemo.addEventListener("click", () => {
  loadBuiltInCharacter(loadDemo, {
    path: "demo-character",
    title: "双马尾舞伴 Demo",
    optionalLayers: ["left_ponytail", "right_ponytail"]
  });
});

loadShortDemo.addEventListener("click", () => {
  loadBuiltInCharacter(loadShortDemo, {
    path: "short-hair-character",
    title: "短发女孩 Demo"
  });
});

motionInput.addEventListener("change", event => {
  const [file] = event.target.files;
  if (!file) return;
  stopPoseTracking();
  resetRigTracking();
  if (motionUrl) URL.revokeObjectURL(motionUrl);
  motionUrl = URL.createObjectURL(file);
  referenceVideo.src = motionUrl;
  referenceVideo.load();
  referenceWrap.classList.remove("hidden");
  motionName.textContent = file.name;
  motionMeta.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · 正在读取`;
  motionReady = true;
  poseState.textContent = "等待识别";
  poseState.className = "pose-state";
  layoutHint.textContent = "视频将在底层播放；拖动上层纸片人调整位置，使用滑杆调整大小。";
  updatePrimaryAction();
  updateExportAction();
});

referenceVideo.addEventListener("loadedmetadata", () => {
  const duration = referenceVideo.duration;
  const durationLabel = Number.isFinite(duration) ? `${duration.toFixed(1)} 秒` : "时长读取中";
  motionMeta.textContent = `${durationLabel} · ${(motionInput.files[0].size / 1024 / 1024).toFixed(1)} MB`;
  configureCompositionSize(referenceVideo.videoWidth, referenceVideo.videoHeight);
  renderLayoutPreview();
  if (duration > 60) hint.textContent = "动作视频较长。绑定阶段建议先用 5–30 秒片段测试，以便快速调整骨架。";
});

function updateLayoutFromPointer(event) {
  const bounds = compositionCanvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const pointerX = (event.clientX - bounds.left) / bounds.width;
  const pointerY = (event.clientY - bounds.top) / bounds.height;
  characterLayout.x = clamp(pointerX - layoutDragOffset.x, 0, 1);
  characterLayout.y = clamp(pointerY - layoutDragOffset.y, 0, 1);
  layoutHint.textContent = `人物位置：${Math.round(characterLayout.x * 100)}% · ${Math.round(characterLayout.y * 100)}%`;
  renderLayoutPreview();
}

compositionCanvas.addEventListener("pointerdown", event => {
  if (!characterReady || exporting) return;
  const bounds = compositionCanvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const pointerX = (event.clientX - bounds.left) / bounds.width;
  const pointerY = (event.clientY - bounds.top) / bounds.height;
  const normalizedHeight = characterLayout.size;
  const normalizedWidth = normalizedHeight
    * characterCanvas.width / characterCanvas.height
    * compositionCanvas.height / compositionCanvas.width;
  const insideCharacter = (
    Math.abs(pointerX - characterLayout.x) <= normalizedWidth / 2
    && Math.abs(pointerY - characterLayout.y) <= normalizedHeight / 2
  );
  if (!insideCharacter) return;
  layoutDragging = true;
  layoutDragOffset.x = pointerX - characterLayout.x;
  layoutDragOffset.y = pointerY - characterLayout.y;
  compositionCanvas.classList.add("dragging");
  compositionCanvas.setPointerCapture(event.pointerId);
});

compositionCanvas.addEventListener("pointermove", event => {
  if (layoutDragging) updateLayoutFromPointer(event);
});

const stopLayoutDrag = event => {
  if (!layoutDragging) return;
  layoutDragging = false;
  compositionCanvas.classList.remove("dragging");
  if (compositionCanvas.hasPointerCapture(event.pointerId)) {
    compositionCanvas.releasePointerCapture(event.pointerId);
  }
};
compositionCanvas.addEventListener("pointerup", stopLayoutDrag);
compositionCanvas.addEventListener("pointercancel", stopLayoutDrag);

characterSizeInput.addEventListener("input", () => {
  characterLayout.size = Number(characterSizeInput.value) / 100;
  characterSizeValue.textContent = `${characterSizeInput.value}%`;
  renderLayoutPreview();
});

resetLayoutButton.addEventListener("click", () => {
  characterLayout.x = .5;
  characterLayout.y = .53;
  characterLayout.size = .72;
  characterSizeInput.value = "72";
  characterSizeValue.textContent = "72%";
  layoutHint.textContent = "布局已复位，可继续拖动纸片人调整位置。";
  renderLayoutPreview();
});

for (const eventName of ["loadeddata", "seeked", "timeupdate"]) {
  referenceVideo.addEventListener(eventName, renderLayoutPreview);
}

function updatePrimaryAction() {
  if (!characterReady) {
    primaryAction.innerHTML = "<span>层</span><strong>先导入分层角色</strong><i>→</i>";
    return;
  }
  if (!motionReady) {
    primaryAction.innerHTML = "<span>▶</span><strong>继续导入动作视频</strong><i>→</i>";
    return;
  }
  primaryAction.innerHTML = tracking
    ? "<span>■</span><strong>停止动作驱动</strong><i>→</i>"
    : "<span>◎</span><strong>让纸片人模仿动作</strong><i>→</i>";
}

function updateExportAction() {
  if (exporting) {
    exportAction.disabled = false;
    exportAction.innerHTML = "<span>■</span><strong>取消导出</strong><i>处理中</i>";
    return;
  }
  exportAction.disabled = !(characterReady && motionReady);
  exportAction.innerHTML = "<span>●</span><strong>录制并导出视频</strong><i>WEBM</i>";
}

function configureCompositionSize(videoWidth, videoHeight) {
  if (!videoWidth || !videoHeight) return;
  const maximumDimension = 1920;
  const scale = Math.min(1, maximumDimension / Math.max(videoWidth, videoHeight));
  const even = value => Math.max(2, Math.round(value / 2) * 2);
  const width = even(videoWidth * scale);
  const height = even(videoHeight * scale);
  exportCanvas.width = width;
  exportCanvas.height = height;
  compositionCanvas.width = width;
  compositionCanvas.height = height;
}

function drawFallbackBackground(context, width, height) {
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#7067d9");
  background.addColorStop(.48, "#9c72d8");
  background.addColorStop(1, "#e9a8c4");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * .5, height * .42, 30, width * .5, height * .45, width * .62);
  glow.addColorStop(0, "rgba(255,255,255,.32)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function renderCompositionFrame(canvas) {
  if (!layerBitmaps.size || !characterCanvas.width) return;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  if (motionReady && referenceVideo.readyState >= 2 && referenceVideo.videoWidth) {
    context.drawImage(referenceVideo, 0, 0, width, height);
  } else {
    drawFallbackBackground(context, width, height);
  }

  const targetHeight = height * characterLayout.size;
  const targetWidth = targetHeight * characterCanvas.width / characterCanvas.height;
  const targetX = characterLayout.x * width - targetWidth / 2;
  const targetY = characterLayout.y * height - targetHeight / 2;
  context.drawImage(characterCanvas, targetX, targetY, targetWidth, targetHeight);
}

function renderLayoutPreview() {
  renderCompositionFrame(compositionCanvas);
}

function renderExportFrame() {
  renderCompositionFrame(exportCanvas);
}

async function ensurePoseLandmarker() {
  if (poseLandmarker) return poseLandmarker;
  const { FilesetResolver, PoseLandmarker } = await import(MODULE_URL);
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  const options = {
    baseOptions:{ modelAssetPath:MODEL_URL, delegate:"GPU" },
    runningMode:"VIDEO", numPoses:1,
    minPoseDetectionConfidence:.5, minPosePresenceConfidence:.5, minTrackingConfidence:.5
  };
  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, options);
  } catch {
    options.baseOptions.delegate = "CPU";
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, options);
  }
  return poseLandmarker;
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const midpoint = (first, second) => ({
  x:(first.x + second.x) / 2,
  y:(first.y + second.y) / 2
});
const distance = (first, second) => Math.hypot(second.x - first.x, second.y - first.y);
const angle = (first, second) => Math.atan2(second.y - first.y, second.x - first.x);

function normalizeAngle(value) {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function rigPoint(name) {
  const [x, y] = (rigJoints || DEFAULT_JOINTS)[name];
  return { x:x * characterCanvas.width, y:y * characterCanvas.height };
}

function posePoint(index) {
  const point = smoothedPose[index];
  return {
    x:point.x * (referenceVideo.videoWidth || 720),
    y:point.y * (referenceVideo.videoHeight || 1280)
  };
}

function mappedPoseIndex(side, joint) {
  const mappedSide = facingBack ? (side === "left" ? "right" : "left") : side;
  return POSE_INDEX[`${mappedSide}${joint}`];
}

function poseSidePoint(side, joint) {
  return posePoint(mappedPoseIndex(side, joint));
}

function poseSideVisibility(side, joint) {
  return smoothedPose[mappedPoseIndex(side, joint)]?.visibility ?? 0;
}

function updateFacingDirection(landmarks) {
  const leftShoulder = landmarks[POSE_INDEX.leftShoulder];
  const rightShoulder = landmarks[POSE_INDEX.rightShoulder];
  const leftHip = landmarks[POSE_INDEX.leftHip];
  const rightHip = landmarks[POSE_INDEX.rightHip];
  const reliable = [leftShoulder, rightShoulder, leftHip, rightHip]
    .every(point => (point.visibility ?? 1) >= .45);
  if (!reliable) return;

  const shoulderDelta = leftShoulder.x - rightShoulder.x;
  const hipDelta = leftHip.x - rightHip.x;
  const backEvidence = shoulderDelta < -.018 && hipDelta < -.012;
  const frontEvidence = shoulderDelta > .018 && hipDelta > .012;
  if (backEvidence) facingBackConfidence = clamp(facingBackConfidence + .16, -1, 1);
  else if (frontEvidence) facingBackConfidence = clamp(facingBackConfidence - .16, -1, 1);
  else facingBackConfidence *= .96;

  if (facingBackConfidence > .42) facingBack = true;
  if (facingBackConfidence < -.42) facingBack = false;
}

function resetRigTracking() {
  smoothedPose = null;
  poseCalibration = null;
  facingBack = false;
  facingBackConfidence = 0;
  if (demoAnimationFrame !== null) cancelAnimationFrame(demoAnimationFrame);
  demoAnimationFrame = null;
  previewRigButton.textContent = "试播骨架动作";
}

function smoothPoseLandmarks(landmarks) {
  const strength = .34;
  if (!smoothedPose) {
    smoothedPose = landmarks.map(point => ({ ...point }));
    return;
  }
  for (let index = 0; index < landmarks.length; index += 1) {
    const incoming = landmarks[index];
    const previous = smoothedPose[index];
    if ((incoming.visibility ?? 1) < .25 && previous) continue;
    previous.x += (incoming.x - previous.x) * strength;
    previous.y += (incoming.y - previous.y) * strength;
    previous.z += ((incoming.z || 0) - (previous.z || 0)) * strength;
    previous.visibility = incoming.visibility;
  }
}

function rotateAround(point, pivot, radians, scale = 1) {
  const x = (point.x - pivot.x) * scale;
  const y = (point.y - pivot.y) * scale;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x:pivot.x + x * cosine - y * sine,
    y:pivot.y + x * sine + y * cosine
  };
}

function fixedEndpoint(start, poseStart, poseEnd, length) {
  const dx = poseEnd.x - poseStart.x;
  const dy = poseEnd.y - poseStart.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  return {
    x:start.x + dx / magnitude * length,
    y:start.y + dy / magnitude * length
  };
}

function drawLayerAt(context, name, sourcePivot, targetPivot, rotation = 0, scale = 1) {
  const layer = layerBitmaps.get(name);
  if (!layer) return;
  context.save();
  context.translate(targetPivot.x, targetPivot.y);
  context.rotate(rotation);
  context.scale(scale, scale);
  context.translate(-sourcePivot.x, -sourcePivot.y);
  context.drawImage(layer.bitmap, 0, 0);
  context.restore();
}

function drawBone(context, name, sourceStartName, sourceEndName, targetStart, targetEnd, scale, jointMargin = {}) {
  const sourceStart = rigPoint(sourceStartName);
  const sourceEnd = rigPoint(sourceEndName);
  const layer = layerBitmaps.get(name);
  if (!layer) return;
  const sourceLength = Math.max(1, distance(sourceStart, sourceEnd));
  const sourceUnit = {
    x:(sourceEnd.x - sourceStart.x) / sourceLength,
    y:(sourceEnd.y - sourceStart.y) / sourceLength
  };
  const sourceNormal = { x:-sourceUnit.y, y:sourceUnit.x };
  const startMargin = sourceLength * (jointMargin.start ?? .025);
  const endMargin = sourceLength * (jointMargin.end ?? .025);
  const stripHalfWidth = Math.hypot(characterCanvas.width, characterCanvas.height);
  const clipStart = {
    x:sourceStart.x - sourceUnit.x * startMargin,
    y:sourceStart.y - sourceUnit.y * startMargin
  };
  const clipEnd = {
    x:sourceEnd.x + sourceUnit.x * endMargin,
    y:sourceEnd.y + sourceUnit.y * endMargin
  };
  const rotation = normalizeAngle(angle(targetStart, targetEnd) - angle(sourceStart, sourceEnd));

  context.save();
  context.translate(targetStart.x, targetStart.y);
  context.rotate(rotation);
  context.scale(scale, scale);
  context.translate(-sourceStart.x, -sourceStart.y);
  context.beginPath();
  context.moveTo(clipStart.x + sourceNormal.x * stripHalfWidth, clipStart.y + sourceNormal.y * stripHalfWidth);
  context.lineTo(clipStart.x - sourceNormal.x * stripHalfWidth, clipStart.y - sourceNormal.y * stripHalfWidth);
  context.lineTo(clipEnd.x - sourceNormal.x * stripHalfWidth, clipEnd.y - sourceNormal.y * stripHalfWidth);
  context.lineTo(clipEnd.x + sourceNormal.x * stripHalfWidth, clipEnd.y + sourceNormal.y * stripHalfWidth);
  context.closePath();
  context.clip();
  context.drawImage(layer.bitmap, 0, 0);
  context.restore();
}

function getLimbComposite(key, layerNames) {
  if (limbCompositeCanvases.has(key)) return limbCompositeCanvases.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = characterCanvas.width;
  canvas.height = characterCanvas.height;
  const context = canvas.getContext("2d");
  for (const name of layerNames) {
    const layer = layerBitmaps.get(name);
    if (layer) context.drawImage(layer.bitmap, 0, 0);
  }
  limbCompositeCanvases.set(key, canvas);
  return canvas;
}

function extendChain(points, startRatio, endRatio) {
  const [start, middle, end] = points;
  return [
    {
      x:start.x - (middle.x - start.x) * startRatio,
      y:start.y - (middle.y - start.y) * startRatio
    },
    middle,
    {
      x:end.x + (end.x - middle.x) * endRatio,
      y:end.y + (end.y - middle.y) * endRatio
    }
  ];
}

function chainCrossSections(points, widths) {
  return points.map((point, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const normal = { x:-dy / magnitude, y:dx / magnitude };
    return {
      first:{ x:point.x + normal.x * widths[index], y:point.y + normal.y * widths[index] },
      second:{ x:point.x - normal.x * widths[index], y:point.y - normal.y * widths[index] }
    };
  });
}

function subdivideChain(points, widths, stepsPerSegment = 3) {
  const resultPoints = [];
  const resultWidths = [];
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const startStep = segment === 0 ? 0 : 1;
    for (let step = startStep; step <= stepsPerSegment; step += 1) {
      const amount = step / stepsPerSegment;
      resultPoints.push({
        x:points[segment].x + (points[segment + 1].x - points[segment].x) * amount,
        y:points[segment].y + (points[segment + 1].y - points[segment].y) * amount
      });
      resultWidths.push(
        widths[segment] + (widths[segment + 1] - widths[segment]) * amount
      );
    }
  }
  return { points:resultPoints, widths:resultWidths };
}

function roundedChain(points, widths, lineSteps = 4, cornerSteps = 8) {
  const [start, joint, end] = points;
  const firstLength = Math.max(1, distance(start, joint));
  const secondLength = Math.max(1, distance(joint, end));
  // Use a broad Bézier turn for sleeves. A tight turn produces a visible
  // miter-like corner when the reference elbow folds across the body.
  const radius = Math.min(firstLength, secondLength) * .3;
  const firstUnit = {
    x:(joint.x - start.x) / firstLength,
    y:(joint.y - start.y) / firstLength
  };
  const secondUnit = {
    x:(end.x - joint.x) / secondLength,
    y:(end.y - joint.y) / secondLength
  };
  const before = {
    x:joint.x - firstUnit.x * radius,
    y:joint.y - firstUnit.y * radius
  };
  const after = {
    x:joint.x + secondUnit.x * radius,
    y:joint.y + secondUnit.y * radius
  };
  const beforeWidth = widths[0] + (widths[1] - widths[0]) * (1 - radius / firstLength);
  const afterWidth = widths[1] + (widths[2] - widths[1]) * (radius / secondLength);
  const resultPoints = [];
  const resultWidths = [];
  const push = (point, width) => {
    resultPoints.push(point);
    resultWidths.push(width);
  };

  for (let step = 0; step <= lineSteps; step += 1) {
    const amount = step / lineSteps;
    push({
      x:start.x + (before.x - start.x) * amount,
      y:start.y + (before.y - start.y) * amount
    }, widths[0] + (beforeWidth - widths[0]) * amount);
  }
  for (let step = 1; step <= cornerSteps; step += 1) {
    const amount = step / cornerSteps;
    const inverse = 1 - amount;
    push({
      x:inverse * inverse * before.x + 2 * inverse * amount * joint.x + amount * amount * after.x,
      y:inverse * inverse * before.y + 2 * inverse * amount * joint.y + amount * amount * after.y
    }, inverse * inverse * beforeWidth + 2 * inverse * amount * widths[1] + amount * amount * afterWidth);
  }
  for (let step = 1; step <= lineSteps; step += 1) {
    const amount = step / lineSteps;
    push({
      x:after.x + (end.x - after.x) * amount,
      y:after.y + (end.y - after.y) * amount
    }, afterWidth + (widths[2] - afterWidth) * amount);
  }
  return { points:resultPoints, widths:resultWidths };
}

function expandedTriangle(points, amount = .7) {
  const center = {
    x:(points[0].x + points[1].x + points[2].x) / 3,
    y:(points[0].y + points[1].y + points[2].y) / 3
  };
  return points.map(point => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    return { x:point.x + dx / magnitude * amount, y:point.y + dy / magnitude * amount };
  });
}

function drawTexturedTriangle(context, texture, source, target) {
  const [sourceA, sourceB, sourceC] = source;
  const [targetA, targetB, targetC] = target;
  const denominator = sourceA.x * (sourceB.y - sourceC.y)
    + sourceB.x * (sourceC.y - sourceA.y)
    + sourceC.x * (sourceA.y - sourceB.y);
  if (Math.abs(denominator) < .0001) return;

  const a = (targetA.x * (sourceB.y - sourceC.y)
    + targetB.x * (sourceC.y - sourceA.y)
    + targetC.x * (sourceA.y - sourceB.y)) / denominator;
  const c = (targetA.x * (sourceC.x - sourceB.x)
    + targetB.x * (sourceA.x - sourceC.x)
    + targetC.x * (sourceB.x - sourceA.x)) / denominator;
  const e = (targetA.x * (sourceB.x * sourceC.y - sourceC.x * sourceB.y)
    + targetB.x * (sourceC.x * sourceA.y - sourceA.x * sourceC.y)
    + targetC.x * (sourceA.x * sourceB.y - sourceB.x * sourceA.y)) / denominator;
  const b = (targetA.y * (sourceB.y - sourceC.y)
    + targetB.y * (sourceC.y - sourceA.y)
    + targetC.y * (sourceA.y - sourceB.y)) / denominator;
  const d = (targetA.y * (sourceC.x - sourceB.x)
    + targetB.y * (sourceA.x - sourceC.x)
    + targetC.y * (sourceB.x - sourceA.x)) / denominator;
  const f = (targetA.y * (sourceB.x * sourceC.y - sourceC.x * sourceB.y)
    + targetB.y * (sourceC.x * sourceA.y - sourceA.x * sourceC.y)
    + targetC.y * (sourceA.x * sourceB.y - sourceB.x * sourceA.y)) / denominator;
  const clipTriangle = expandedTriangle(target);

  context.save();
  context.beginPath();
  context.moveTo(clipTriangle[0].x, clipTriangle[0].y);
  context.lineTo(clipTriangle[1].x, clipTriangle[1].y);
  context.lineTo(clipTriangle[2].x, clipTriangle[2].y);
  context.closePath();
  context.clip();
  context.setTransform(a, b, c, d, e, f);
  context.drawImage(texture, 0, 0);
  context.restore();
}

function drawLimbMesh(context, key, layerNames, sourcePoints, targetPoints, widths, scale, extension) {
  const texture = getLimbComposite(key, layerNames);
  const prepareChain = extension.rounded ? roundedChain : subdivideChain;
  const sourceChain = prepareChain(
    extendChain(sourcePoints, extension.start, extension.end),
    widths
  );
  const targetChain = prepareChain(
    extendChain(targetPoints, extension.start, extension.end),
    widths.map(width => width * scale)
  );
  const sourceSections = chainCrossSections(sourceChain.points, sourceChain.widths);
  const targetSections = chainCrossSections(targetChain.points, targetChain.widths);

  for (let index = 0; index < sourceSections.length - 1; index += 1) {
    const sourceStart = sourceSections[index];
    const sourceEnd = sourceSections[index + 1];
    const targetStart = targetSections[index];
    const targetEnd = targetSections[index + 1];
    drawTexturedTriangle(
      context,
      texture,
      [sourceStart.first, sourceStart.second, sourceEnd.second],
      [targetStart.first, targetStart.second, targetEnd.second]
    );
    drawTexturedTriangle(
      context,
      texture,
      [sourceStart.first, sourceEnd.second, sourceEnd.first],
      [targetStart.first, targetEnd.second, targetEnd.first]
    );
  }
}

function renderRigPose(landmarks) {
  if (!characterReady || !layerBitmaps.size) return;
  updateFacingDirection(landmarks);
  smoothPoseLandmarks(landmarks);

  const poseLeftShoulder = poseSidePoint("left", "Shoulder");
  const poseRightShoulder = poseSidePoint("right", "Shoulder");
  const poseLeftHip = poseSidePoint("left", "Hip");
  const poseRightHip = poseSidePoint("right", "Hip");
  const poseShoulderCenter = midpoint(poseLeftShoulder, poseRightShoulder);
  const poseHipCenter = midpoint(poseLeftHip, poseRightHip);

  const baseLeftShoulder = rigPoint("leftShoulder");
  const baseRightShoulder = rigPoint("rightShoulder");
  const baseLeftHip = rigPoint("leftHip");
  const baseRightHip = rigPoint("rightHip");
  const baseShoulderCenter = midpoint(baseLeftShoulder, baseRightShoulder);
  const baseHipCenter = midpoint(baseLeftHip, baseRightHip);

  if (!poseCalibration) {
    poseCalibration = {
      hipCenter:poseHipCenter,
      shoulderWidth:Math.max(1, distance(poseLeftShoulder, poseRightShoulder))
    };
  }

  const mapScale = distance(baseLeftShoulder, baseRightShoulder) / poseCalibration.shoulderWidth;
  const drift = {
    x:clamp((poseHipCenter.x - poseCalibration.hipCenter.x) * mapScale, -characterCanvas.width * .09, characterCanvas.width * .09),
    y:clamp((poseHipCenter.y - poseCalibration.hipCenter.y) * mapScale, -characterCanvas.height * .07, characterCanvas.height * .09)
  };
  const targetHipCenter = {
    x:baseHipCenter.x + drift.x,
    y:baseHipCenter.y + drift.y
  };
  const poseBodyAngle = angle(poseHipCenter, poseShoulderCenter);
  const baseBodyAngle = angle(baseHipCenter, baseShoulderCenter);
  const bodyRotation = clamp(normalizeAngle(poseBodyAngle - baseBodyAngle), -.38, .38);
  const shoulderRatio = distance(poseLeftShoulder, poseRightShoulder) / poseCalibration.shoulderWidth;
  const bodyScale = clamp(1 + (shoulderRatio - 1) * .2, .94, 1.06);

  const bodyTarget = name => {
    const rotated = rotateAround(rigPoint(name), baseHipCenter, bodyRotation, bodyScale);
    return {
      x:rotated.x + targetHipCenter.x - baseHipCenter.x,
      y:rotated.y + targetHipCenter.y - baseHipCenter.y
    };
  };

  const targetLeftShoulder = bodyTarget("leftShoulder");
  const targetRightShoulder = bodyTarget("rightShoulder");
  const targetLeftHip = bodyTarget("leftHip");
  const targetRightHip = bodyTarget("rightHip");
  const targetNeck = bodyTarget("neck");

  const chain = (side, upperStart, upperEnd, lowerEnd) => {
    const poseUpperStart = poseSidePoint(side, upperStart);
    let poseUpperEnd = poseSidePoint(side, upperEnd);
    const mappedLowerEnd = poseSidePoint(side, lowerEnd);
    const raised = upperStart === "Shoulder"
      && mappedLowerEnd.y < poseUpperStart.y - (referenceVideo.videoHeight || 1280) * .035;
    if (raised && (
      poseSideVisibility(side, upperEnd) < .42
      || poseUpperEnd.y > poseUpperStart.y + (referenceVideo.videoHeight || 1280) * .02
    )) {
      const bend = (side === "left" ? 1 : -1) * (referenceVideo.videoWidth || 720) * .025;
      poseUpperEnd = {
        x:poseUpperStart.x + (mappedLowerEnd.x - poseUpperStart.x) * .52 + bend,
        y:poseUpperStart.y + (mappedLowerEnd.y - poseUpperStart.y) * .52
      };
    }
    const targetStart = upperStart === "Shoulder"
      ? (side === "left" ? targetLeftShoulder : targetRightShoulder)
      : (side === "left" ? targetLeftHip : targetRightHip);
    const sourceStartName = `${side}${upperStart}`;
    const sourceMiddleName = `${side}${upperEnd}`;
    const sourceEndName = `${side}${lowerEnd}`;
    const targetMiddle = fixedEndpoint(
      targetStart,
      poseUpperStart,
      poseUpperEnd,
      distance(rigPoint(sourceStartName), rigPoint(sourceMiddleName)) * bodyScale
    );
    const targetEnd = fixedEndpoint(
      targetMiddle,
      poseUpperEnd,
      mappedLowerEnd,
      distance(rigPoint(sourceMiddleName), rigPoint(sourceEndName)) * bodyScale
    );
    return { targetStart, targetMiddle, targetEnd, raised };
  };

  const leftArm = chain("left", "Shoulder", "Elbow", "Wrist");
  const rightArm = chain("right", "Shoulder", "Elbow", "Wrist");
  const leftLeg = chain("left", "Hip", "Knee", "Ankle");
  const rightLeg = chain("right", "Hip", "Knee", "Ankle");

  const context = characterCanvas.getContext("2d");
  context.clearRect(0, 0, characterCanvas.width, characterCanvas.height);

  const headRotation = clamp(
    normalizeAngle(angle(poseSidePoint("right", "Ear"), poseSidePoint("left", "Ear"))),
    -.42,
    .42
  );
  for (const name of ["hair_back"]) {
    drawLayerAt(context, name, rigPoint("neck"), targetNeck, headRotation, bodyScale);
  }

  const drawLegMesh = (side, leg) => {
    const halfWidth = characterCanvas.width * .125;
    drawLimbMesh(
      context,
      `${side}_leg`,
      [`${side}_thigh`, `${side}_calf`],
      [rigPoint(`${side}Hip`), rigPoint(`${side}Knee`), rigPoint(`${side}Ankle`)],
      [leg.targetStart, leg.targetMiddle, leg.targetEnd],
      [halfWidth * .88, halfWidth, halfWidth * .9],
      bodyScale,
      // Keep a generous hidden root underneath the rigid pelvis layer. This
      // prevents the trouser leg from opening up at the hip on wide poses.
      { start:.32, end:.035 }
    );
  };
  drawLegMesh("right", rightLeg);
  drawLegMesh("left", leftLeg);

  const drawFoot = (side, targetAnkle) => {
    const poseAnkle = poseSidePoint(side, "Ankle");
    const poseFoot = poseSidePoint(side, "Foot");
    const footRotation = clamp(normalizeAngle(angle(poseAnkle, poseFoot) - Math.PI / 2), -1, 1);
    drawLayerAt(context, `${side}_foot`, rigPoint(`${side}Ankle`), targetAnkle, footRotation, bodyScale);
  };
  drawFoot("right", rightLeg.targetEnd);
  drawFoot("left", leftLeg.targetEnd);

  const drawBackgroundUpperArm = (side, arm) => {
    drawBone(
      context,
      `${side}_upper_arm`,
      `${side}Shoulder`,
      `${side}Elbow`,
      arm.targetStart,
      arm.targetMiddle,
      bodyScale,
      { start:.02, end:.1 }
    );
  };
  drawBackgroundUpperArm("right", rightArm);
  drawBackgroundUpperArm("left", leftArm);

  // The torso is the shoulder socket mask: paint it after the complete arm
  // chains so raised upper arms cannot leave stretched sleeve fragments over
  // the chest. Hands remain foreground layers below.
  for (const name of ["skirt_back", "torso", "pelvis"]) {
    drawLayerAt(context, name, baseHipCenter, targetHipCenter, bodyRotation, bodyScale);
  }

  const drawHand = (side, arm) => {
    const poseWrist = poseSidePoint(side, "Wrist");
    const poseFinger = poseSidePoint(side, "Index");
    const fingerDirection = angle(poseWrist, poseFinger);
    const forearmDirection = angle(arm.targetMiddle, arm.targetEnd);
    const useForearmDirection = arm.raised
      || poseSideVisibility(side, "Index") < .42
      || Math.abs(normalizeAngle(fingerDirection - forearmDirection)) > Math.PI * .72;
    const handDirection = useForearmDirection ? forearmDirection : fingerDirection;
    const handRotation = clamp(normalizeAngle(handDirection - Math.PI / 2), -Math.PI, Math.PI);
    drawLayerAt(context, `${side}_hand`, rigPoint(`${side}Wrist`), arm.targetEnd, handRotation, bodyScale);
  };
  // Upper arms stay behind the hair so the ponytails hide the reconstructed
  // shoulder sockets. Forearms and hands are drawn exactly once in front.
  for (const name of ["right_ponytail", "left_ponytail"]) {
    drawLayerAt(context, name, rigPoint("neck"), targetNeck, headRotation, bodyScale);
  }

  const drawForegroundForearm = (side, arm) => {
    drawBone(
      context,
      `${side}_forearm`,
      `${side}Elbow`,
      `${side}Wrist`,
      arm.targetMiddle,
      arm.targetEnd,
      bodyScale,
      { start:.08, end:.06 }
    );
  };
  drawForegroundForearm("right", rightArm);
  drawForegroundForearm("left", leftArm);

  drawHand("right", rightArm);
  drawHand("left", leftArm);

  drawLayerAt(context, "head", rigPoint("neck"), targetNeck, headRotation, bodyScale);
  for (const name of ["hair_front", "skirt_front", "accessory"]) {
    drawLayerAt(context, name, baseHipCenter, targetHipCenter, bodyRotation, bodyScale);
  }
  renderLayoutPreview();
}

function createDemoLandmarks(elapsed) {
  const phase = elapsed / 1000;
  const bounce = Math.abs(Math.sin(phase * Math.PI)) * .018;
  const sway = Math.sin(phase * Math.PI * .7) * .018;
  const leftLift = Math.max(0, Math.sin(phase * 2));
  const rightLift = Math.max(0, -Math.sin(phase * 2));
  const armFold = (1 - Math.cos(phase * 1.2)) * .5;
  const mix = (from, to) => from + (to - from) * armFold;
  const points = Array.from({ length:33 }, () => ({
    x:.5,
    y:.5,
    z:0,
    visibility:1
  }));
  const set = (index, x, y) => Object.assign(points[index], { x:x + sway, y:y - bounce });
  set(0, .5, .16);
  set(7, .55, .18 + Math.sin(phase * 1.4) * .006);
  set(8, .45, .18 - Math.sin(phase * 1.4) * .006);
  set(11, .59, .31);
  set(12, .41, .31);
  set(13, mix(.69, .72), mix(.25 + Math.sin(phase * 2.2) * .04, .43));
  set(14, mix(.31, .28), mix(.43 + Math.sin(phase * 2.2 + Math.PI) * .04, .43));
  set(15, mix(.66 + Math.sin(phase * 2.6) * .07, .53), mix(.14 + Math.cos(phase * 2.6) * .035, .39));
  set(16, mix(.25, .47), mix(.55 + Math.sin(phase * 2.2) * .04, .47));
  set(19, mix(.66 + Math.sin(phase * 2.6) * .08, .49), mix(.1 + Math.cos(phase * 2.6) * .035, .38));
  set(20, mix(.23, .51), mix(.59 + Math.sin(phase * 2.2) * .04, .46));
  set(23, .55, .55);
  set(24, .45, .55);
  set(25, .58 + leftLift * .04, .73 - leftLift * .055);
  set(26, .42 - rightLift * .04, .73 - rightLift * .055);
  set(27, .62 - leftLift * .07, .9 - leftLift * .11);
  set(28, .38 + rightLift * .07, .9 - rightLift * .11);
  set(29, points[27].x - .01, points[27].y + .025);
  set(30, points[28].x + .01, points[28].y + .025);
  set(31, points[27].x + .035, points[27].y + .035);
  set(32, points[28].x - .035, points[28].y + .035);
  return points;
}

function playRigDemo() {
  if (!characterReady || demoAnimationFrame !== null) return;
  resetRigTracking();
  previewRigButton.textContent = "试播中…";
  studioState.textContent = "骨架动作试播";
  const startedAt = performance.now();
  const frame = now => {
    const elapsed = now - startedAt;
    renderRigPose(createDemoLandmarks(elapsed));
    if (elapsed < 5200) {
      demoAnimationFrame = requestAnimationFrame(frame);
      return;
    }
    demoAnimationFrame = null;
    previewRigButton.textContent = "试播骨架动作";
    studioState.textContent = "角色绑定完成";
    resetRigTracking();
    renderCharacterComposite();
  };
  demoAnimationFrame = requestAnimationFrame(frame);
}

previewRigButton.addEventListener("click", playRigDemo);

function drawPose(landmarks) {
  const width = referenceVideo.videoWidth || 1;
  const height = referenceVideo.videoHeight || 1;
  if (poseCanvas.width !== width || poseCanvas.height !== height) {
    poseCanvas.width = width;
    poseCanvas.height = height;
  }
  const context = poseCanvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "#ffe06b";
  context.fillStyle = "#ff88b1";
  context.lineWidth = Math.max(3, width / 220);
  context.lineCap = "round";
  for (const [from, to] of CONNECTIONS) {
    if ((landmarks[from].visibility ?? 1) < .35 || (landmarks[to].visibility ?? 1) < .35) continue;
    context.beginPath();
    context.moveTo(landmarks[from].x * width, landmarks[from].y * height);
    context.lineTo(landmarks[to].x * width, landmarks[to].y * height);
    context.stroke();
  }
  for (const index of new Set(CONNECTIONS.flat())) {
    const point = landmarks[index];
    if ((point.visibility ?? 1) < .35) continue;
    context.beginPath();
    context.arc(point.x * width, point.y * height, Math.max(3, width / 180), 0, Math.PI * 2);
    context.fill();
  }
}

function preferredRecorderMimeType() {
  if (!("MediaRecorder" in window)) return "";
  return [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ].find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function clearExportResult() {
  if (exportUrl) URL.revokeObjectURL(exportUrl);
  exportUrl = "";
  exportResult.removeAttribute("href");
  exportResult.classList.add("hidden");
}

function setExportControlsLocked(locked) {
  folderInput.disabled = locked;
  motionInput.disabled = locked;
  loadDemo.disabled = locked;
  loadShortDemo.disabled = locked;
  previewRigButton.disabled = locked || !characterReady;
  characterSizeInput.disabled = locked || !characterReady;
  resetLayoutButton.disabled = locked || !characterReady;
  primaryAction.disabled = locked;
}

function updateExportProgress() {
  if (!exporting) return;
  const duration = referenceVideo.duration;
  const progress = Number.isFinite(duration) && duration > 0
    ? Math.min(99, Math.round(referenceVideo.currentTime / duration * 100))
    : 0;
  exportAction.innerHTML = `<span>■</span><strong>取消导出</strong><i>${progress}%</i>`;
  studioState.textContent = `正在导出 ${progress}%`;
}

function finishExportRecording(cancelled = false) {
  if (!exporting) return;
  exportCancelled = cancelled;
  exporting = false;
  tracking = false;
  if (videoFrameCallback !== null && "cancelVideoFrameCallback" in referenceVideo) {
    referenceVideo.cancelVideoFrameCallback(videoFrameCallback);
  }
  videoFrameCallback = null;
  referenceVideo.pause();
  clearInterval(exportProgressTimer);
  exportProgressTimer = null;
  if (mediaRecorder?.state !== "inactive") mediaRecorder.stop();
  else finalizeExportRecording();
}

function finalizeExportRecording() {
  setExportControlsLocked(false);
  if (exportCancelled) {
    exportChunks = [];
    mediaRecorder = null;
    studioState.textContent = "导出已取消";
    hint.textContent = "导出已取消，角色和动作素材仍保留在当前页面。";
    updatePrimaryAction();
    updateExportAction();
    return;
  }

  const type = mediaRecorder?.mimeType || "video/webm";
  const blob = new Blob(exportChunks, { type });
  exportChunks = [];
  mediaRecorder = null;
  if (!blob.size) {
    studioState.textContent = "导出失败";
    hint.textContent = "浏览器没有生成视频数据，请换用最新版 Chrome 或 Edge 后重试。";
    updatePrimaryAction();
    updateExportAction();
    return;
  }
  exportUrl = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  exportResult.href = exportUrl;
  exportResult.download = `paperdoll-${stamp}.webm`;
  exportResult.textContent = `导出完成 · 下载视频（${(blob.size / 1024 / 1024).toFixed(1)} MB）`;
  exportResult.classList.remove("hidden");
  studioState.textContent = "视频导出完成";
  poseState.textContent = "动作已录制";
  poseState.className = "pose-state active";
  hint.textContent = "视频已在本机生成。点击“导出完成”保存 WebM 文件，原动作视频不会上传。";
  updatePrimaryAction();
  updateExportAction();
}

async function seekReferenceVideoToStart() {
  if (referenceVideo.currentTime === 0) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("动作视频回到开头超时")), 5000);
    referenceVideo.addEventListener("seeked", () => {
      clearTimeout(timeout);
      resolve();
    }, { once:true });
    referenceVideo.currentTime = 0;
  });
}

async function startVideoExport() {
  if (!characterReady || !motionReady) return;
  if (!("captureStream" in exportCanvas) || !("MediaRecorder" in window)) {
    hint.textContent = "当前浏览器不支持本地画布录制，请使用最新版 Chrome 或 Edge。";
    return;
  }

  clearExportResult();
  stopPoseTracking();
  resetRigTracking();
  renderCharacterComposite();
  setExportControlsLocked(true);
  exportAction.disabled = true;
  poseState.textContent = "正在准备识别模型与录制器";
  poseState.className = "pose-state";
  studioState.textContent = "准备导出";
  hint.textContent = "正在准备本地动作识别。导出期间请保持此页面打开。";

  try {
    await ensurePoseLandmarker();
    await seekReferenceVideoToStart();
    const outputStream = exportCanvas.captureStream(30);
    const captureVideo = referenceVideo.captureStream || referenceVideo.mozCaptureStream;
    if (captureVideo) {
      const referenceStream = captureVideo.call(referenceVideo);
      for (const track of referenceStream.getAudioTracks()) outputStream.addTrack(track);
    }
    const mimeType = preferredRecorderMimeType();
    mediaRecorder = mimeType
      ? new MediaRecorder(outputStream, { mimeType, videoBitsPerSecond:5_000_000 })
      : new MediaRecorder(outputStream, { videoBitsPerSecond:5_000_000 });
    exportChunks = [];
    exportCancelled = false;
    mediaRecorder.addEventListener("dataavailable", event => {
      if (event.data.size) exportChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", finalizeExportRecording, { once:true });
    mediaRecorder.addEventListener("error", event => {
      console.error(event.error || event);
      exportCancelled = true;
      finishExportRecording(true);
      hint.textContent = "录制器发生错误，未生成文件。请缩短动作视频后重试。";
    });

    exporting = true;
    tracking = true;
    updateExportAction();
    mediaRecorder.start(1000);
    await referenceVideo.play();
    videoFrameCallback = referenceVideo.requestVideoFrameCallback(processPoseFrame);
    exportProgressTimer = setInterval(updateExportProgress, 250);
    updateExportProgress();
    hint.textContent = "正在逐帧识别动作并录制视频与纸片人的合成画面；点击导出按钮可取消。";
  } catch (error) {
    console.error(error);
    exporting = false;
    tracking = false;
    exportCancelled = true;
    clearInterval(exportProgressTimer);
    exportProgressTimer = null;
    if (mediaRecorder?.state !== "inactive") mediaRecorder.stop();
    else finalizeExportRecording();
    poseState.textContent = "导出准备失败";
    poseState.className = "pose-state warning";
    hint.textContent = "无法启动导出。请确认动作视频可播放，并检查 MediaPipe 模型网络是否可用。";
  }
}

function processPoseFrame() {
  if (!tracking) return;
  if (referenceVideo.readyState >= 2) {
    const result = poseLandmarker.detectForVideo(referenceVideo, performance.now());
    const landmarks = result.landmarks?.[0];
    if (landmarks) {
      drawPose(landmarks);
      renderRigPose(landmarks);
      const trackedIndexes = [
        0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28
      ];
      const visibleCount = trackedIndexes.filter(index => (landmarks[index].visibility ?? 1) >= .35).length;
      if (visibleCount >= 10) {
        poseState.textContent = facingBack
          ? "检测到人物背身 · 已切换左右映射"
          : "纸片人正在跟踪动作";
        poseState.className = "pose-state active";
      } else {
        poseState.textContent = "部分关键点丢失 · 已平滑补偿";
        poseState.className = "pose-state warning";
      }
      if (!exporting) studioState.textContent = "动作驱动中";
    } else {
      poseState.textContent = "未识别到人物 · 保持上一姿态";
      poseState.className = "pose-state warning";
      renderLayoutPreview();
    }
    if (exporting) renderExportFrame();
  }
  videoFrameCallback = referenceVideo.requestVideoFrameCallback(processPoseFrame);
}

function stopPoseTracking() {
  tracking = false;
  if (videoFrameCallback !== null && "cancelVideoFrameCallback" in referenceVideo) {
    referenceVideo.cancelVideoFrameCallback(videoFrameCallback);
  }
  videoFrameCallback = null;
  referenceVideo.pause();
  updatePrimaryAction();
}

primaryAction.addEventListener("click", async () => {
  if (exporting) return;
  if (!characterReady) {
    folderInput.click();
    return;
  }
  if (!motionReady) {
    motionInput.click();
    return;
  }
  if (tracking) {
    stopPoseTracking();
    studioState.textContent = "动作检查暂停";
    return;
  }
  primaryAction.disabled = true;
  resetRigTracking();
  poseState.textContent = "正在加载本地识别模型";
  hint.textContent = "首次运行需要下载 MediaPipe 姿态模型；模型就绪后会直接驱动纸片人的独立身体图层。";
  try {
    await ensurePoseLandmarker();
    tracking = true;
    if (referenceVideo.ended) referenceVideo.currentTime = 0;
    await referenceVideo.play();
    videoFrameCallback = referenceVideo.requestVideoFrameCallback(processPoseFrame);
    hint.textContent = "纸片人已开始模仿动作。抬手时手掌会沿前臂方向响应；人物背身时会自动交换左右侧，短暂丢点则保持上一姿态。";
  } catch (error) {
    console.error(error);
    poseState.textContent = "识别模型加载失败";
    poseState.className = "pose-state warning";
    hint.textContent = "请确认网络可访问 MediaPipe 模型，或稍后改为随项目本地打包模型。";
  } finally {
    primaryAction.disabled = false;
    updatePrimaryAction();
  }
});

exportAction.addEventListener("click", () => {
  if (exporting) {
    finishExportRecording(true);
    return;
  }
  startVideoExport();
});

referenceVideo.addEventListener("ended", () => {
  if (exporting) {
    finishExportRecording(false);
    return;
  }
  stopPoseTracking();
  studioState.textContent = "动作检查完成";
});

renderLayerChecklist();
updateExportAction();
