#!/bin/bash

# NL象棋快速启动脚本

echo "🎯 NL象棋 - 中国象棋在线对战平台"
echo "=================================="

# 检查Node.js版本
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js 版本过低，请升级到 16+"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "⚠️  未找到 .env 文件，正在复制示例文件..."
    cp .env.example .env
    echo "📝 请编辑 .env 文件配置数据库和其他服务"
    echo "⚠️  特别注意配置以下项目："
    echo "   - 数据库连接信息"
    echo "   - Redis连接信息"
    echo "   - JWT密钥"
    echo "   - 邮件服务配置"
    read -p "配置完成后按回车继续..."
fi

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
fi

# 检查数据库连接
echo "🔍 检查数据库连接..."
node -e "
const config = require('./server/config/config');
const mysql = require('mysql2/promise');

async function checkDB() {
    try {
        const connection = await mysql.createConnection({
            host: config.database.host,
            port: config.database.port,
            user: config.database.user,
            password: config.database.password
        });
        console.log('✅ 数据库连接成功');
        await connection.end();
    } catch (error) {
        console.log('❌ 数据库连接失败:', error.message);
        console.log('请检查数据库配置和服务状态');
        process.exit(1);
    }
}
checkDB();
" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "⚠️  无法验证数据库连接，请确保："
    echo "   1. MySQL 服务已启动"
    echo "   2. .env 文件中的数据库配置正确"
    echo "   3. 数据库用户有足够权限"
    read -p "是否继续启动？(y/N): " confirm
    if [[ $confirm != [yY] ]]; then
        exit 1
    fi
fi

# 初始化数据库
echo "🗄️  初始化数据库..."
if command -v mysql &> /dev/null; then
    mysql -h${DB_HOST:-localhost} -u${DB_USER:-root} -p${DB_PASSWORD} < database/init.sql 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✅ 数据库初始化完成"
    else
        echo "⚠️  数据库初始化可能失败，请手动执行 database/init.sql"
    fi
else
    echo "⚠️  未找到 mysql 客户端，请手动执行 database/init.sql"
fi

# 检查Redis连接
echo "🔍 检查Redis连接..."
if command -v redis-cli &> /dev/null; then
    redis-cli ping > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ Redis连接成功"
    else
        echo "⚠️  Redis连接失败，请启动Redis服务"
    fi
else
    echo "⚠️  未找到 redis-cli，无法验证Redis连接"
fi

# 创建必要目录
echo "📁 创建必要目录..."
mkdir -p logs uploads dist

# 构建前端（如果需要）
if [ ! -d "dist" ] || [ ! "$(ls -A dist)" ]; then
    echo "🔨 构建前端资源..."
    npm run build 2>/dev/null || echo "⚠️  前端构建失败，将使用开发模式"
fi

echo ""
echo "🚀 启动服务器..."
echo "=================================="
echo "访问地址: http://localhost:${PORT:-3000}"
echo "管理面板: http://localhost:${PORT:-3000}/admin"
echo "API文档: http://localhost:${PORT:-3000}/api/docs"
echo ""
echo "按 Ctrl+C 停止服务"
echo "=================================="

# 启动应用
if [ "$NODE_ENV" = "development" ]; then
    npm run dev
else
    npm start
fi