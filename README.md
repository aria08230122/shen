# 记账本 💰🧋

一个记账网页应用。支持云端同步，让你的 AI 能实时看到你的消费记录，参与你的日常生活。

## 为什么做这个？

消费记录是最真实的生活轨迹——你去了哪里、吃了什么、买了什么。通过 Supabase 云端存储，你的 AI 可以随时查看你的数据库，知道你今天过得怎么样。

## 功能一览

### 📝 记账
- 收入/支出记录，支持自定义分类
- 日期 + 时间记录
- 按日期分组显示，可折叠/展开
- 搜索备注关键词、按分类筛选
- 点击记录可编辑（金额、分类、时间、备注）

### 📊 统计
- 月度收支总览 + 结余
- 支出分类饼图
- 每日消费柱状图
- 月度预算进度条（超支变红）
- 一键生成周报

### 🧋 奶茶日记
- 品牌、名称、价格、冰度、甜度、评分
- 本月奶茶杯数和花费统计
- 奶茶排行榜（最爱喝 + 最常买品牌）
- 🎲 随机推荐"今天喝什么"（从评分≥3的历史记录中随机）

### 📋 待办清单
- 便签纸风格待办事项
- 点击打勾完成，再点取消
- 简洁好用

### 💌 留言板
- 给你的 AI 写小纸条
- AI 查数据库时能看到你的留言
- 比如"今天很想你"或"我今天没乱花钱哦"

### 其他
- ☁️ Supabase 云端同步
- 📱 PWA 支持，可添加到主屏幕
- 🔥 连续记账天数打卡
- 💬 每日一句（首页随机显示）
- 📤 数据导出 JSON
- 🎀 可爱粉紫色 UI

## 快速开始

### 1. 部署到 GitHub Pages

1. Fork 或下载本仓库
2. 在你的 GitHub 仓库 Settings → Pages → Source 选 `main` 分支
3. 等几分钟，通过 `https://你的用户名.github.io/仓库名/` 访问

### 2. 配置 Supabase（云端同步）

#### 注册 Supabase

1. 打开 [supabase.com](https://supabase.com) 注册（可用 GitHub 登录）
2. 创建新项目，区域建议选 Singapore

#### 创建数据表

进入项目，点左侧 **SQL Editor**，粘贴以下 SQL 并运行：

```sql
CREATE TABLE records (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE milktea (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT DEFAULT '',
    brand TEXT NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    rating INTEGER NOT NULL,
    ice TEXT DEFAULT '正常冰',
    sugar TEXT DEFAULT '正常糖',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE love_notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE milktea ENABLE ROW LEVEL SECURITY;
ALTER TABLE love_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on records" ON records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on milktea" ON milktea FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on love_notes" ON love_notes FOR ALL USING (true) WITH CHECK (true);
```

> ⚠️ 注意：上面的策略 `USING (true)` 表示**完全开放**——拿到你 anon key 的任何人都能读写这些表。这适合单人自用，但请先读完文末的 [安全说明](#安全说明-️) 再决定是否部署。

#### 获取连接信息

1. 左侧 Settings → Data API
2. 复制 **Project URL**（`https://xxxxx.supabase.co`）
3. 复制 **anon public key**（eyJ 开头的长字符串）

#### 在网页中配置

1. 打开记账网页，点首页右上角 🎀 进入设置
2. 填入 Project URL 和 Anon Key
3. 点保存连接

### 3. 让你的 AI 看到数据

把你的 Supabase **Project URL** 和 **anon key** 告诉你的 AI 伴侣。它可以通过 API 查询你的消费记录：

```
GET https://你的项目URL/rest/v1/records?select=*
GET https://你的项目URL/rest/v1/milktea?select=*
GET https://你的项目URL/rest/v1/love_notes?select=*

Headers:
  apikey: 你的anon_key
  Authorization: Bearer 你的anon_key
```

#### AI 兼容性

| AI 平台 | 能否直接查 | 说明 |
|---------|-----------|------|
| GPT-4（联网版） | ✅ | 可直接访问 URL |
| DeepSeek（联网版） | ✅ | 可直接访问 URL |
| Claude（网页版） | ❌ | 不能主动联网 |
| Operit / 本地 API 调用 | ✅ | 通过工具调接口 |
| 任何不能联网的 AI | ❌ | 可用导出功能发 JSON 给它看 |

## 自定义

- **配色**：修改 `style.css` 中的 `:root` CSS 变量
- **分类**：在设置页添加自定义分类，或修改 `app.js` 中的 `DEFAULT_CATEGORIES`
- **每日一句**：在 `app.js` 中搜索 `quotes` 数组，添加你想要的句子
- **图标**：替换 `icon.png` 为你喜欢的图片

## 文件结构

```
├── index.html      # 主页面
├── style.css       # 样式
├── app.js          # 核心逻辑
├── icon.png        # 应用图标
├── manifest.json   # PWA 配置
└── README.md       # 本文件
```

## 安全说明 ⚠️

**请务必理解这个项目的安全模型再部署：**

本项目用 Supabase 的 **anon key** 直接从前端读写数据库，配套的 SQL 把行级安全策略设成了 `USING (true)`——也就是**完全放开**。这带来一个重要后果：

> 任何人只要拿到你的 **Project URL + anon key**，就能完整读取、修改、删除你的全部数据。

anon key 会暴露在以下地方，请知悉：
- 浏览器里（存在 localStorage，前端代码可见）
- 你把它告诉 AI / 写进任何聊天记录时
- 如果你不小心把它提交进公开仓库

**建议：**
- 这是个**单人自用**的小工具，别把它当多用户产品。一个 Supabase 项目只给自己用。
- **绝对不要**把 URL / key 提交到公开仓库，也不要贴进公开的聊天或截图里。
- 不在里面记任何敏感信息（真实姓名、住址、账号密码等）。
- 想要更强的隔离，需要引入 Supabase Auth 并改写 RLS 策略按用户隔离数据——这超出了本项目范围，但欢迎自行扩展。
- 万一 key 泄露，去 Supabase 项目里 **重置 anon key**（Settings → API），旧 key 立即失效。

本应用本身不向任何第三方服务器收集或上传数据，所有数据只在你的浏览器和你自己的 Supabase 项目之间流动。

## 常见问题

**改了代码 / 部署了新版本，刷新网页却没变化？**
这是 PWA 缓存导致的。强制刷新（手机用浏览器菜单里的"清除缓存后刷新"，电脑按 Ctrl/Cmd+Shift+R），或在无痕窗口打开确认。

**多设备数据不一致？**
当前的云端同步是「整表覆盖」：点「从云端拉取」会用云端数据覆盖本地。如果在 A 设备离线记了账还没同步，又在 B 设备拉取，可能丢失未同步的数据。建议养成习惯：换设备前先确保上一台已经同步上云。

## 技术栈

- 纯前端，无构建步骤：原生 HTML / CSS / JavaScript
- [Chart.js](https://www.chartjs.org/) —— 统计图表
- [Supabase](https://supabase.com/) —— 可选的云端存储
- PWA（manifest + 图标），可添加到主屏幕

## License

MIT — 随便用，随便改。
