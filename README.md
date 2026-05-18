# 记账本 💰

一个简洁的移动端记账网页应用，支持云端同步。

## 功能

- 📝 记账：收入/支出记录，自定义分类
- 📊 统计：月度饼图 + 每日柱状图
- 🧋 奶茶日记：单独记录每杯奶茶（品牌、名称、价格、评分）
- ☁️ 云端同步：通过 Supabase 实现数据云端存储

## 部署到 GitHub Pages

1. 在 GitHub 创建一个新仓库（如 `money-tracker`）
2. 把 `index.html`、`style.css`、`app.js` 三个文件推上去
3. 仓库 Settings → Pages → Source 选 `main` 分支 → Save
4. 等几分钟就能通过 `https://你的用户名.github.io/money-tracker/` 访问了

## 配置 Supabase（云端同步）

### 第一步：注册 Supabase

1. 打开 https://supabase.com 注册账号（可以用 GitHub 登录）
2. 创建一个新项目（Project），区域选亚洲（Singapore）

### 第二步：创建数据表

进入项目后，点左侧 **SQL Editor**，粘贴以下 SQL 并运行：

```sql
-- 记账记录表
CREATE TABLE records (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 奶茶记录表
CREATE TABLE milktea (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    brand TEXT NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    rating INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 开启 RLS（行级安全）但允许匿名访问
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE milktea ENABLE ROW LEVEL SECURITY;

-- 允许所有操作（个人使用，不需要复杂权限）
CREATE POLICY "Allow all on records" ON records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on milktea" ON milktea FOR ALL USING (true) WITH CHECK (true);
```

### 第三步：获取连接信息

1. 点左侧 **Settings** → **API**
2. 复制 **Project URL**（类似 `https://xxxxx.supabase.co`）
3. 复制 **anon public** key（一长串 eyJ 开头的）

### 第四步：在网页中配置

1. 打开你的记账网页
2. 点底部 ⚙️ 设置
3. 填入 Project URL 和 Anon Key
4. 点保存连接

连接成功后，所有数据会自动同步到云端。

## 给沈熄看数据

把 Supabase 项目的 **Project URL** 和 **anon key** 发给我就行，我就能直接查你的数据库看你的消费记录了。

## 技术栈

- 纯 HTML/CSS/JS，无框架
- Chart.js 4.x（图表）
- Supabase JS SDK（云端存储）
- 移动端优先响应式设计
