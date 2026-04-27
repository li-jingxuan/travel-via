#!/usr/bin/env bash
set -euo pipefail

# 本地开发时先注入模型调用所需环境变量，再启动 TypeScript watch 编译。
export OPENAI_API_KEY=sk-5b1f72544f6a4b219bfa542190fd1107

tsc --watch
