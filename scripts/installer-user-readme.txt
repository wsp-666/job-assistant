求职助手 - 安装后说明

1. 双击桌面「求职助手」
2. 点击「一键启动」→ 等待约 30 秒 →「打开应用」
3. 使用邮箱注册/登录，在「设置」购买会员
4. Edge 扩展：加载安装目录下的 extension 文件夹
5. 点击 Edge 工具栏「求职助手」图标打开插件面板

数据保存在本机 data 目录，无需配置数据库。

---
升级安装（覆盖安装新版 Setup.exe）

1. 请先关闭「求职助手」启动器窗口（重要）
2. 双击新版 JobAssistant-Setup.exe，选择原安装目录覆盖安装
3. 不必先卸载；若启动仍报错，再卸载后重装

---
启动失败怎么办？

1. 确认安装目录下有这些文件夹：api、web、runtime、extension、JobAssistant
2. 双击安装目录里的「诊断启动问题.bat」，看哪一步报错
3. 打开安装目录\data\launcher-api.log，把内容发给开发者
4. 常见原因：
   - 日志出现 No Python at 'D:\download\conda\...' → 不是没装 Python，是旧安装包绑定了开发者电脑路径
     解决：运行「修复运行环境.bat」，或安装最新版 JobAssistant-Setup.exe 后重装
   - 杀毒软件拦截了 runtime\Scripts\python.exe → 添加信任/白名单
   - 8000 端口被占用 → 关闭占用程序后重试
   - 安装不完整 → 重新运行 JobAssistant-Setup.exe（安装前先关闭求职助手）

若提示缺少运行库，请安装：
Microsoft Visual C++ 2015-2022 运行库 (x64)
