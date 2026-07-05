# Cognitive Gym · 认知健身房

> 把大脑当肌肉训练——每天15分钟，提升工作记忆、决策直觉和量化思维。

**在线体验** → [benjaminjason.github.io/cognitive-gym](https://benjaminjason.github.io/cognitive-gym/)

---

## 训练模块

| 模块 | 训练目标 | 说明 |
|------|---------|------|
| **N-Back** | 工作记忆 | 经典双 N-Back 任务，难度自适应 |
| **围棋 AI** | 空间推理 · 长期规划 | 内置 MCTS AI，支持 9×9 / 13×13 / 19×19 棋盘 |
| **费米估算** | 量化直觉 · 数量级感知 | 无需精确答案，训练数量级判断力 |
| **每周复盘** | 进度追踪 | 可视化每周训练数据 |

## 技术栈

- **框架**：React 19 + TypeScript + Vite
- **样式**：Tailwind CSS v4
- **AI**：MCTS（蒙特卡洛树搜索）运行在 Web Worker，不阻塞主线程
- **存储**：localStorage，无需登录，数据留在本地
- **部署**：GitHub Pages（GitHub Actions 自动构建）

## 本地运行

```bash
git clone https://github.com/BenjaminJason/cognitive-gym.git
cd cognitive-gym
npm install
npm run dev
```

访问 [http://localhost:5173](http://localhost:5173)

## 构建

```bash
npm run build   # 输出到 dist/
npm run preview # 本地预览构建产物
```

## 设计理念

训练项目参考认知科学研究：
- **N-Back**：Jaeggi et al. (2008) — 工作记忆训练的迁移效应
- **围棋**：树搜索模拟人类计划思维，MCTS 提供有挑战性的对手
- **费米估算**：数量级思维是工程和科研中被低估的核心技能
