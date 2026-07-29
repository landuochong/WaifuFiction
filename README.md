# 纸片舞伴

一个本地运行的“分层纸片人 + 真人动作视频”工作台。角色按照标准规范绑定一次，之后可以反复导入动作，不调用付费视频生成 API。

## 文档

- [系统设计](DESIGN.md)：整体架构、动作处理管线、渲染层级、素材构建和已知边界。
- [分层素材规范](paperdoll-spec.md)：角色图层、画布、关节重叠和 `manifest.json` 要求。
- [骨架模板](paperdoll-template/manifest.json)：制作新角色时可复制并调整的关节配置。

## 当前阶段

- 导入包含多张透明 PNG 的角色素材文件夹。
- 检查 15 个必需图层是否齐全、是否重复、是否能够解码并带透明背景。
- 检查全部图层画布尺寸是否一致且不小于 1024×1024。
- 按标准层级在浏览器 Canvas 中合成角色预览。
- 导入真人动作视频，通过 MediaPipe 在本机显示全身动作骨架。
- 按 `manifest.json` 读取肩、肘、腕、髋、膝、踝关节。
- 用固定肢体长度驱动独立图层，避免胳膊和腿被动作坐标拉长。
- 对关键点做逐帧平滑；短暂识别失败时保持上一姿态。
- 检测人物正面/背面朝向；背身时自动交换左右侧映射，避免胳膊和腿反向响应。
- 手臂上举时对低置信度肘部进行补偿，并让手掌优先沿前臂方向继续向上。
- 手臂和腿使用连续纹理网格沿骨架变形；肘、膝两侧共享同一纹理截面，不再依赖两张刚性图片互相遮盖。
- 将纸片人画面与动作视频中的音轨在浏览器内录制为 WebM，并提供本地下载。

下一阶段将继续完善脚底锁定、身体前后层级判断和头发惯性。

## 运行

```bash
python3 server.py
```

访问 `http://127.0.0.1:8765`。

项目服务只负责提供本地网页，不接收角色或视频上传。首次动作识别需要联网下载 MediaPipe 浏览器模型，模型加载后逐帧识别在本机执行。

## 素材

- 完整规则：[paperdoll-spec.md](paperdoll-spec.md)
- 骨架模板：[paperdoll-template/manifest.json](paperdoll-template/manifest.json)
- 双马尾演示：[demo-character/](demo-character/)（15 个必需图层、2 个双马尾层和关节配置）
- 短发演示：[short-hair-character/](short-hair-character/)（15 个必需图层和关节配置）

页面中的“加载内置演示”和“加载短发演示”可以直接读取对应素材，不需要先打开文件选择器。

## 构建演示素材

演示素材生成脚本依赖 Pillow：

```bash
python3 -m pip install Pillow
```

重新生成双马尾素材：

```bash
python3 scripts/build_demo_character.py
```

短发角色与双马尾角色使用相同画布、服装、身体比例和关节点，因此复用已经调校好的六个手臂图层，以避免肩、肘接缝因重新切图发生变化：

```bash
python3 scripts/build_demo_character.py \
  --source short-hair-character/master.png \
  --output short-hair-character \
  --name "短发女孩 Demo" \
  --without-ponytails \
  --without-sleeve-reconstruction \
  --reuse-arms-from demo-character
```

`--reuse-arms-from` 只适用于画布尺寸、身体比例、服装和骨架关节都一致的角色；普通用户素材不应强行复用。

## 动作与导出

1. 加载内置演示，或导入符合规范的角色文件夹。
2. 导入单人、全身入镜的 MP4、MOV 或 WebM 动作视频。
3. 点击“让纸片人模仿动作”检查绑定效果。
4. 点击“录制并导出视频”，等待进度结束后下载 WebM。

导出过程与视频录制都在浏览器本机完成。动作视频包含可解码音轨时，音频会一起写入结果；无音轨的视频会导出为静音动画。推荐使用最新版 Chrome 或 Edge。

当前角色素材是正面绘制，因此人物背身时会正确交换左右肢体并跟随动作，但纸片人仍显示正面外观。若需要真正显示后脑、后背和背面服装，需要再提供一套背面图层素材。

素材文件夹必须包含：

```text
head.png                   torso.png                 pelvis.png
left_upper_arm.png         left_forearm.png          left_hand.png
right_upper_arm.png        right_forearm.png         right_hand.png
left_thigh.png             left_calf.png             left_foot.png
right_thigh.png            right_calf.png            right_foot.png
```

所有 PNG 必须使用相同尺寸的透明画布，叠放后能还原角色。

## 隐私与费用

- 不需要 `FAL_KEY` 或其他付费服务密钥。
- 不产生按生成次数收取的费用。
- 角色图层和动作视频由浏览器直接读取，不发送到项目后端。
