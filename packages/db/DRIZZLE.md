# Drizzle 常用命令

本文档整理了当前项目在 `packages/db` 目录下使用 Drizzle Kit 的常见命令。

当前项目已经有独立配置文件：

- [drizzle.config.ts](/Volumes/D/projects/travel-via/packages/db/drizzle.config.ts)

因此以下命令都建议在项目根目录执行，并通过 `pnpm -C packages/db exec` 调用。

## 1. 最常用命令

### 1.1 直接把 schema 推到数据库

适合本地开发快速建表、同步表结构。

```bash
pnpm -C packages/db exec drizzle-kit push
```

### 1.2 生成 migration 文件

适合把 schema 变更记录成 migration 文件，便于版本管理。

```bash
pnpm -C packages/db exec drizzle-kit generate
```

### 1.3 执行 migration

配合 `generate` 使用，把已生成的 migration 真正执行到数据库。

```bash
pnpm -C packages/db exec drizzle-kit migrate
```

## 2. 常见工作流

### 2.1 快速开发流

如果当前目标只是本地快速跑起来，推荐直接使用：

```bash
pnpm -C packages/db exec drizzle-kit push
```

### 2.2 标准 migration 流

如果希望更规范地管理数据库结构变更，推荐使用：

```bash
pnpm -C packages/db exec drizzle-kit generate
pnpm -C packages/db exec drizzle-kit migrate
```

## 3. 其它常用命令

### 3.1 从数据库反向拉取 schema

适合数据库中已经有表，希望反向生成或更新 Drizzle schema。

```bash
pnpm -C packages/db exec drizzle-kit pull
```

### 3.2 检查 migration 状态

用于检查 migration 历史、快照或结构是否存在问题。

```bash
pnpm -C packages/db exec drizzle-kit check
```

### 3.3 打开 Drizzle Studio

用于可视化查看数据库表结构与数据。

```bash
pnpm -C packages/db exec drizzle-kit studio
```

### 3.4 升级旧快照

用于升级旧版 migration snapshot。

```bash
pnpm -C packages/db exec drizzle-kit up
```

### 3.5 导出 SQL

生成当前 schema 对应的 SQL，但不直接执行。

```bash
pnpm -C packages/db exec drizzle-kit export
```

### 3.6 生成自定义 migration

适合你想手写 SQL 或保留空白 migration 时使用。

```bash
pnpm -C packages/db exec drizzle-kit generate --custom --name=init-history
```

## 4. 当前项目推荐用法

### 4.1 首次建表

如果你刚配置好 `DATABASE_URL`，建议先执行：

```bash
pnpm -C packages/db exec drizzle-kit push
```

这会根据当前 schema 文件把业务表直接推到数据库。

当前项目的业务 schema 主要在：

- [src/schema/history.ts](/Volumes/D/projects/travel-via/packages/db/src/schema/history.ts)

### 4.2 后续迭代

如果后面 history 表结构继续演进，推荐使用 migration 流：

```bash
pnpm -C packages/db exec drizzle-kit generate
pnpm -C packages/db exec drizzle-kit migrate
```

## 5. 说明

### 5.1 LangGraph checkpoint 表

当前项目除了业务表，还使用了 LangGraph 的 `PostgresSaver`。

这部分 checkpoint 表不是通过 Drizzle Kit 手动创建的，而是在运行时由：

- [src/checkpointer.ts](/Volumes/D/projects/travel-via/packages/db/src/checkpointer.ts)

里的 `setup()` 自动初始化。

### 5.2 数据库连接来源

Drizzle Kit 与应用运行时共用同一套数据库配置，配置入口在：

- [src/config.ts](/Volumes/D/projects/travel-via/packages/db/src/config.ts)

默认读取：

- `DATABASE_URL`
- `DATABASE_POOL_MAX`

## 6. 常用命令速查

```bash
pnpm -C packages/db exec drizzle-kit push
pnpm -C packages/db exec drizzle-kit generate
pnpm -C packages/db exec drizzle-kit migrate
pnpm -C packages/db exec drizzle-kit pull
pnpm -C packages/db exec drizzle-kit check
pnpm -C packages/db exec drizzle-kit studio
pnpm -C packages/db exec drizzle-kit export
```
