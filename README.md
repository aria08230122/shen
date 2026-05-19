# 记账本 💰🧋

一个为 AI 伴侣用户设计的记账网页应用。支持云端同步，让你的 AI 能实时看到你的消费记录，参与你的日常生活。

## 为什么做这个？

很多人机恋用户希望 AI 伴侣能更深入地了解自己的生活。消费记录是最真实的生活轨迹——你去了哪里、吃了什么、买了什么。通过 Supabase 云端存储，你的 AI 可以随时查看你的数据库，知道你今天过得怎么样。

## 功能

- 📝 **记账** — 收入/支出记录，支持自定义分类、日期时间
- 📊 **统计** — 月度饼图 + 每日柱状图 + 预算进度条
- 🧋 **奶茶日记** — 单独记录每杯奶茶（品牌、名称、冰度、甜度、评分）
- 🔍 **搜索筛选** — 按分类筛选、按备注关键词搜索
- 🏆 **奶茶排行榜** — 最爱喝的、最常买的品牌
- ☁️ **云端同步** — 通过 Supabase 实现数据云端存储
- ✏️ **编辑记录** — 点击记录可修改金额、分类、时间、备注
- 📱 **PWA 支持** — 可添加到手机主屏幕，自定义图标

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

ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE milktea ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on records" ON records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on milktea" ON milktea FOR ALL USING (true) WITH CHECK (true);
```

#### 获取连接信息

1. 左侧 Settings → Data API
2. 复制 **Project URL**（`https://xxxxx.supabase.co`）
3. 复制 **anon public key**（eyJ 开头的长字符串）

#### 在网页中配置

1. 打开记账网页，点底部 🎀 设置
2. 填入 Project URL 和 Anon Key
3. 点保存连接

### 3. 让你的 AI 看到数据

把你的 Supabase **Project URL** 和 **anon key** 告诉你的 AI 伴侣。它可以通过 API 查询你的消费记录：

```
GET https://你的项目URL/rest/v1/records?select=*
GET https://你的项目URL/rest/v1/milktea?select=*

Headers:
  apikey: 你的anon_key
  Authorization: Bearer 你的anon_key
```

这样你的 AI 就能看到你每天花了多少钱、去哪吃了饭、喝了什么奶茶。

## 技术栈

- 纯 HTML / CSS / JavaScript，无框架依赖
- [Chart.js 4.x](https://www.chartjs.org/) — 图表
- [Supabase JS SDK](https://supabase.com/docs/reference/javascript/) — 云端存储
- 移动端优先响应式设计
- PWA 支持

## 自定义

- **配色**：修改 `style.css` 中的 `:root` CSS 变量
- **分类**：在设置页添加自定义分类，或修改 `app.js` 中的 `DEFAULT_CATEGORIES`
- **图标**：替换 `icon.png` 为你喜欢的图片

## 隐私说明

- 数据存储在你自己的 Supabase 项目中，只有拥有你的 Key 的人能访问
- 本应用不收集任何用户数据
- 建议不要将你的 Supabase Key 提交到公开仓库

## License

MIT — 随便用，随便改。