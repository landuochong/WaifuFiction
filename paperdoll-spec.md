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
- 上臂与小臂应围绕骨骼中心线保留稳定、接近一致的宽度；旋转中心必须落在实际肩、肘和腕关节上，不能只按外接矩形中心切图。
- 肩部连接可藏在躯干或前景头发下，但手臂图层本身仍应完整，不能依赖头发像素补齐袖子。
- `pelvis` 应覆盖大腿顶部，裤腰、裙腰等连续纹理尽量完整保留在 `pelvis` 图层中。
- 手掌必须与小臂分离，避免腕部无法独立转动。
- 鞋或脚必须与小腿分离，用于脚底锁定和踮脚动作。
- 后发放在 `hair_back`，刘海和遮脸发丝放在 `hair_front`。
- 不要在手臂图层中保留腿、裙子或背景像素。

## 6. 同骨架换装或换发型

只有发型、面部等非骨架区域发生变化，且画布、身体比例、服装与关节点完全一致时，可以复用已经验证过的手臂或腿部图层。这样能保持关节宽度、纹理和旋转中心一致。

如果新角色的袖型、裤型、四肢长度或身体比例不同，必须重新切分对应图层并调整 `manifest.json`，不能通过缩放旧图层代替。

复用前至少检查：

- 被复用图层与新角色的画布尺寸完全相同。
- `manifest.json` 中肩、肘、腕或髋、膝、踝坐标一致。
- 静态叠放时服装纹理连续，没有旧角色的头发或身体像素。
- 使用“试播骨架动作”检查举手、弯肘、交叉手臂、屈膝和大跨步。

## 7. 验收建议

新素材不应只检查自然站姿。至少覆盖以下动作：

- 双臂下垂、平举、过头举起和大角度弯肘。
- 手臂经过头发、胸前和身体两侧时的前后层级。
- 双腿分开、单腿弯曲和膝盖交叉。
- 躯干左右倾斜时的肩部、腰部和髋部连接。
- 人物短暂出画或关键点置信度降低后的姿态恢复。
