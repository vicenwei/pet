# 森屿桌宠

桌面端工具包含两个窗口：

- 后台工具窗口：配置 API、检测原始图、生成动作图、预览、看日志和状态路径。
- 透明桌宠窗口：只显示森屿、气泡、简短思考路径，并响应鼠标互动。

## 使用步骤

1. 把原始角色图放到 `assets/pets/senyu_base.png`，角色基准名固定为 `senyu_base`。
2. 启动应用：双击 `start-senyu.cmd`，或在终端运行 `pnpm.cmd run dev`。
   浏览器后台地址：`http://127.0.0.1:17872/#/admin`。
3. 在后台工具里填写 `API URL` 和 `API Key`，点击“保存配置”。
4. 点击“测试连接”。
5. 点击“生成动作图”。

如果使用后台工具里的“更换图片”，可以选择 PNG、JPG 或 JPEG；应用会自动保存成 `assets/pets/senyu_base.png`。

生成结果保存在 `assets/pets/generated/`：

- `idle.png`
- `hover.png`
- `touch.png`
- `wave.png`
- `sleep.png`
- `talk.png`
- `surprised.png`
- `drag.png`

## 安全提醒

生成动作图会把 `assets/pets/senyu_base.png` 发送给你填写的第三方生图 API。请确认 API 服务可信，并留意可能产生的调用费用。

API Key 不会写进代码仓库；本机配置保存在系统用户数据目录的 `config.json`。

## 当前已完善

- 后台工具可以直接打开原始图目录和生成目录。
- 外观设置里可以调整桌宠大小、气泡、置顶和任务栏显示。
- 动作生成区会显示真实的准备状态和最近日志。
- 重复启动应用时会回到已有窗口，避免开出多只桌宠。
