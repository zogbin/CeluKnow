#!/bin/bash

# CeluKnow 仓颉智库 安装脚本

set -e

echo "========================================"
echo "  CeluKnow 仓颉智库 安装脚本"
echo "========================================"

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "错误: Node.js 版本过低，需要 >= 16.0.0"
    echo "当前版本: $(node -v)"
    exit 1
fi

echo "✓ Node.js 版本检查通过: $(node -v)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "错误: npm 未安装"
    exit 1
fi

echo "✓ npm 版本: $(npm -v)"

# 安装后端依赖
echo ""
echo "正在安装后端依赖..."
cd server
npm install
cd ..

echo "✓ 后端依赖安装完成"

# 安装前端依赖
echo ""
echo "正在安装前端依赖..."
cd client
npm install
cd ..

echo "✓ 前端依赖安装完成"

# 创建数据目录
echo ""
echo "正在创建数据目录..."
mkdir -p data/documents
echo "✓ 数据目录创建完成"

echo ""
echo "========================================"
echo "  安装完成！"
echo "========================================"
echo ""
echo "启动服务："
echo "  终端1: cd server && npm run dev"
echo "  终端2: cd client && npm run dev"
echo ""
echo "访问地址: http://localhost:5173"
echo ""