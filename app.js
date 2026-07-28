const characterInput = document.querySelector("#character-input");
const motionInput = document.querySelector("#motion-input");
const characterImage = document.querySelector("#character-image");
const stageImage = document.querySelector("#stage-image");
const defaultAvatar = document.querySelector("#default-avatar");
const avatarWrap = document.querySelector("#avatar-wrap");
const status = document.querySelector("#status");
const hint = document.querySelector("#hint");
const motionTitle = document.querySelector("#motion-title");
const motionDetail = document.querySelector("#motion-detail");
const motionCaption = document.querySelector("#motion-caption");
const presets = [...document.querySelectorAll(".preset")];
const sequenceButton = document.querySelector("#sequence-button");
const freeControlButton = document.querySelector("#free-control-button");
const jointControls = document.querySelector("#joint-controls");
const bonePuppet = document.querySelector("#bone-puppet");
let selectedMotion = "bounce";
let hasCharacter = true;
let hasMotionVideo = false;
let isPerforming = false;
let usesGeneratedFrames = true;
let frameRunId = 0;
let freeControlMode = false;

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const jumpFrames = [
  ["ready", 230],
  ["crouch", 180],
  ["takeoff", 150],
  ["apex", 220],
  ["descent", 150],
  ["land", 210],
  ["ready", 260]
];
const grooveFrames = [
  ["groove-1", 120],
  ["groove-3", 380],
  ["groove-1", 120],
  ["groove-3-mirror", 380]
];
const spinFrames = [
  ["spin-action-1", 165],
  ["spin-action-2", 165],
  ["spin-action-3", 165],
  ["spin-action-4", 165],
  ["spin-action-5", 165],
  ["spin-action-6", 165],
  ["spin-action-7", 165],
  ["spin-action-8", 165]
];

function stopFrameAnimation() {
  frameRunId += 1;
}

async function playFrameAnimation(frames) {
  const runId = ++frameRunId;
  while (runId === frameRunId) {
    for (const [frame, duration] of frames) {
      if (runId !== frameRunId) return;
      stageImage.src = `animation-frames/${frame}.png?v=13`;
      await delay(duration);
    }
  }
}

function setMotion(motion, label) {
  if (freeControlMode) exitFreeControl();
  stopFrameAnimation();
  selectedMotion = motion;
  avatarWrap.className = `avatar-wrap motion-${motion}${usesGeneratedFrames ? " frame-mode" : ""}`;
  bonePuppet.classList.add("hidden");
  bonePuppet.classList.remove("auto-groove");
  stageImage.classList.remove("hidden");
  motionCaption.textContent = label;
  presets.forEach(button => button.classList.toggle("active", button.dataset.motion === motion));
  status.textContent = isPerforming ? "连续舞步中" : (hasCharacter ? "可以预览" : "等待角色图");
  if (usesGeneratedFrames) {
    stageImage.src = "animation-frames/ready.png?v=13";
    if (motion === "bounce") playFrameAnimation(jumpFrames);
    if (motion === "groove") playFrameAnimation(grooveFrames);
    if (motion === "spin") playFrameAnimation(spinFrames);
  }
}

function enterFreeControl() {
  stopFrameAnimation();
  freeControlMode = true;
  stageImage.classList.add("hidden");
  bonePuppet.classList.remove("hidden");
  bonePuppet.classList.remove("auto-groove");
  jointControls.classList.remove("hidden");
  avatarWrap.className = "avatar-wrap frame-mode";
  freeControlButton.innerHTML = "<span>×</span>退出自由控制";
  motionCaption.textContent = "自由控制";
  status.textContent = "拖动关节滑杆";
  hint.textContent = "肩带动整条手臂，肘只控制前臂；髋带动整条腿，膝只控制小腿。";
}

function exitFreeControl() {
  freeControlMode = false;
  bonePuppet.classList.add("hidden");
  stageImage.classList.remove("hidden");
  jointControls.classList.add("hidden");
  freeControlButton.innerHTML = "<span>◎</span>自由控制四肢 <i>→</i>";
}

characterInput.addEventListener("change", event => {
  const [file] = event.target.files;
  if (!file) return;
  const imageUrl = URL.createObjectURL(file);
  characterImage.src = imageUrl;
  stageImage.src = imageUrl;
  characterImage.classList.remove("hidden");
  stageImage.classList.remove("hidden");
  defaultAvatar.classList.add("hidden");
  usesGeneratedFrames = false;
  stopFrameAnimation();
  hasCharacter = true;
  status.textContent = "角色已就位";
  hint.textContent = "角色图已同步到舞台；点击动作按钮即可预览。";
});

motionInput.addEventListener("change", event => {
  const [file] = event.target.files;
  if (!file) return;
  hasMotionVideo = true;
  motionTitle.textContent = file.name;
  motionDetail.textContent = "动作参考已选好，等待生成";
  status.textContent = hasCharacter ? "动作已就位" : "等待角色图";
  hint.textContent = "已选真人动作参考。现在可先用预设动作预览角色。";
});

presets.forEach(button => button.addEventListener("click", () => {
  if (!isPerforming) setMotion(button.dataset.motion, button.dataset.label);
}));

sequenceButton.addEventListener("click", async () => {
  if (isPerforming) return;
  isPerforming = true;
  sequenceButton.disabled = true;
  sequenceButton.innerHTML = "<span>♫</span>正在跳舞…";
  const routine = [
    ["breathe", "准备动作", 1100],
    ["bounce", "跳跳跳", 2450],
    ["groove", "左右摇摆", 2200],
    ["spin", "转个圈圈", 1800],
    ["groove", "收尾摇摆", 1300]
  ];
  status.textContent = "连续舞步中";
  for (const [motion, label, duration] of routine) {
    setMotion(motion, label);
    await delay(duration);
  }
  status.textContent = "舞步完成";
  hint.textContent = "连续舞步播放完成。可以再试一次，或切换到单个动作。";
  sequenceButton.disabled = false;
  sequenceButton.innerHTML = "<span>✦</span>再跳一遍 <i>→</i>";
  isPerforming = false;
});

freeControlButton.addEventListener("click", () => {
  if (isPerforming) return;
  if (freeControlMode) {
    exitFreeControl();
    const activePreset = presets.find(button => button.dataset.motion === selectedMotion);
    setMotion(selectedMotion, activePreset?.dataset.label || "动作预览");
  } else {
    enterFreeControl();
  }
});

jointControls.querySelectorAll("input[data-joint]").forEach(input => {
  input.addEventListener("input", () => {
    bonePuppet.style.setProperty(`--${input.dataset.joint}`, `${input.value}deg`);
  });
});

document.querySelector("#generate-button").addEventListener("click", () => {
  if (isPerforming) return;
  if (!hasCharacter) {
    status.textContent = "请先上传角色图";
    hint.textContent = "先准备一张完整的全身角色图，才能生成你的纸片舞伴。";
    characterInput.click();
    return;
  }
  status.textContent = "预览已生成";
  hint.textContent = hasMotionVideo
    ? "动作预览已播放。下一步接入动作迁移模型，即可使用这段真人舞蹈驱动角色。"
    : "动作预览已播放；上传跳舞视频后，可将真实舞步迁移给角色。";
  avatarWrap.classList.remove(`motion-${selectedMotion}`);
  requestAnimationFrame(() => avatarWrap.classList.add(`motion-${selectedMotion}`));
});

setMotion("bounce", "元气跳跳");
