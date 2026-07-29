# Paperdoll 分层素材规范 v1

本规范用于“角色绑定一次、动作无限复用”的本地 2D 动作工作台。素材不会上传到云端，也不依赖任何按次付费的生成服务。

## 1. 基础要求

- 使用正面自然站姿或轻微 A-Pose，头部朝上。
- 所有部件导出为带透明通道的 PNG。
- 每个部件图层都必须保留透明背景；整张画布完全不透明的 PNG 会被拒绝。
- 所有 PNG 必须使用完全相同的画布尺寸，叠放后能够还原完整角色。
- 画布不得小于 1024×1024，推荐竖版 1536×2048。
- 文件名使用小写英文和下划线。
- `left`、`right` 均以角色自身方向为准，不以观看者方向为准。
- 上下臂、大小腿的关节连接处必须互相穿插，重叠长度建议为对应骨段长度的 6%–10%，且不低于 32 像素。
- 大腿顶部必须延伸到 `pelvis` 内部，髋关节周围建议保留至少骨段长度 8% 的纹理。
- 各部件不得夹带其他肢体的像素。

## 2. 必需图层

```text
head.png
torso.png
pelvis.png

left_upper_arm.png
left_forearm.png
left_hand.png
right_upper_arm.png
right_forearm.png
right_hand.png

left_thigh.png
left_calf.png
left_foot.png
right_thigh.png
right_calf.png
right_foot.png
```

共 15 个必需图层。缺失、重复命名或画布尺寸不同都会阻止绑定。

## 3. 可选动态层

```text
hair_back.png
hair_front.png
left_ponytail.png
right_ponytail.png
skirt_back.png
skirt_front.png
accessory.png
```

马尾、裙摆和配饰将在后续阶段使用弹性骨骼产生惯性。

## 4. 目录示例

```text
my-character/
├── manifest.json
├── head.png
├── torso.png
├── pelvis.png
├── left_upper_arm.png
├── left_forearm.png
├── left_hand.png
├── right_upper_arm.png
├── right_forearm.png
├── right_hand.png
├── left_thigh.png
├── left_calf.png
├── left_foot.png
├── right_thigh.png
├── right_calf.png
├── right_foot.png
├── hair_back.png
└── hair_front.png
```

`manifest.json` 用于定义角色骨架关节。缺少配置时会使用通用模板，但为了让手肘、膝盖等旋转中心准确，正式素材应提供针对角色调整后的坐标。

## 5. 绘制注意事项

- 肩部素材应延伸到躯干内部，肘部和膝部应绘制为圆形或椭圆形连接面，避免在关节中心做一刀切的水平边缘。
- `pelvis` 应覆盖大腿顶部，裤腰、裙腰等连续纹理尽量完整保留在 `pelvis` 图层中。
- 手掌必须与小臂分离，避免腕部无法独立转动。
- 鞋或脚必须与小腿分离，用于脚底锁定和踮脚动作。
- 后发放在 `hair_back`，刘海和遮脸发丝放在 `hair_front`。
- 不要在手臂图层中保留腿、裙子或背景像素。
