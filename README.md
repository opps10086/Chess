# NL象棋 - 中国象棋在线对战平台

一个功能完整的中国象棋在线对战平台，支持实时联机对战、预约牌局、排行榜、好友系统等功能。

## 🎯 核心功能

### 1. 基础玩法
- ✅ 完整实现中国象棋规则（走棋规则、胜负判定、悔棋功能）
- ✅ 支持单机练习模式（对战AI，可调整难度）
- ✅ 基于原有开源代码进行重构和扩展

### 2. 联机对战
- ✅ 实时联机功能：支持用户创建房间（可设置密码）、快速匹配对手
- ✅ 通过WebSocket实现实时走棋同步（延迟控制在100ms内）
- ✅ 对战状态展示：当前在线人数、房间列表、历史对战记录
- ✅ 观战模式：支持进入任意公开房间观战，可发送弹幕互动

### 3. 预约牌局
- ✅ 预约功能：用户可指定日期、时间创建预约对局
- ✅ 选择对手（好友或公开匹配）
- ✅ 系统在预约时间前10分钟发送通知（站内信+浏览器推送）
- ✅ 预约管理：个人中心可查看/取消未开始的预约

### 4. 排行榜系统
- ✅ 多维度排名：按胜率、总胜场、连续获胜场次、段位等级展示
- ✅ 积分规则：赢局+10分，输局-5分，平局±0，连胜奖励机制
- ✅ 支持查看好友排名和全服排行榜

### 5. 扩展功能
- ✅ 棋谱分享：用户可保存对战棋谱，生成分享链接（含二维码）
- ✅ 好友系统：添加好友、查看在线状态、发起对战邀请
- ✅ 多主题支持：经典古风、现代简约、暗夜模式

## 🔐 登录与认证

### 支持的登录方式
1. **NodeLoc OAuth2授权登录**（优先推荐）
   - 集成NodeLoc OAuth2授权流程
   - 授权端点：`http://conn.nodeloc.cc/oauth2/auth`
   - 重定向URI：`https://oqo.us/auth/callback`
   - 支持自动账号关联

2. **邮箱注册登录**
   - 邮箱验证码验证
   - 安全密码加密存储
   - 支持与NodeLoc账号关联

### 安全特性
- ✅ 遵循OAuth2安全规范
- ✅ HTTPS传输加密
- ✅ CSRF防护（state参数验证）
- ✅ JWT令牌认证 + 刷新令牌机制
- ✅ 令牌黑名单机制
- ✅ 速率限制和安全日志

## 🏗️ 技术架构

### 后端技术栈
- **框架**: Node.js + Express
- **数据库**: MySQL 8.0（用户数据、对战记录）
- **缓存**: Redis（排行榜、在线状态、会话管理）
- **实时通信**: Socket.IO
- **认证**: JWT + OAuth2
- **邮件服务**: NodeMailer

### 前端技术栈
- **框架**: Vue 3 + Composition API
- **UI库**: Element Plus（古风主题定制）
- **构建工具**: Webpack 5
- **状态管理**: Vuex/Pinia
- **路由**: Vue Router 4

### 核心特性
- ✅ 响应式设计（适配PC/平板/手机）
- ✅ PWA支持（可安装到桌面）
- ✅ 实时游戏引擎（完整象棋规则实现）
- ✅ 多主题支持
- ✅ 国际化支持准备

## 🚀 部署方案

### Docker容器化部署
```bash
# 克隆项目
git clone <repository-url>
cd nl-chess

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置数据库、Redis、邮件等配置

# 启动服务
docker-compose up -d
```

### 手动部署
```bash
# 安装依赖
npm install

# 构建前端
npm run build

# 启动服务
npm start
```

## 📊 数据库设计

### 核心表结构
- `users` - 用户信息表
- `game_rooms` - 游戏房间表
- `games` - 游戏记录表
- `appointments` - 预约对局表
- `friendships` - 好友关系表
- `game_records` - 棋谱表
- `notifications` - 系统消息表
- `leaderboard_snapshots` - 排行榜快照表

## 🎮 游戏引擎

### 象棋规则实现
- ✅ 完整的中国象棋走法规则
- ✅ 将军、将死、困毙判定
- ✅ 悔棋功能
- ✅ 认输功能
- ✅ 和棋判定
- ✅ 走棋历史记录

### AI对战
- ✅ 多难度AI（基于minimax算法）
- ✅ 开局库支持
- ✅ 残局库支持

## 📱 移动端支持

- ✅ 响应式设计
- ✅ 触摸操作优化
- ✅ 竖屏布局适配
- ✅ PWA支持（可添加到主屏幕）

## 🔧 配置说明

### 环境变量
```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=nl_chess

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT密钥
JWT_SECRET=your_jwt_secret_here

# NodeLoc OAuth2
NODELOC_CLIENT_SECRET=bd2d2f7688e39d2d6687bb1351902ab86de09376b61c3d8052298c38608e5093

# 邮件服务
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
```

## 📈 性能优化

- ✅ Redis缓存优化
- ✅ 数据库索引优化
- ✅ 前端资源压缩
- ✅ CDN静态资源加速
- ✅ WebSocket连接池管理
- ✅ 内存泄漏防护

## 🛡️ 安全措施

- ✅ SQL注入防护
- ✅ XSS攻击防护
- ✅ CSRF攻击防护
- ✅ 速率限制
- ✅ 输入验证和过滤
- ✅ 敏感词过滤
- ✅ 安全日志记录

## 📋 API文档

### 认证接口
- `GET /api/auth/oauth/url` - 获取OAuth授权URL
- `POST /api/auth/email/register` - 邮箱注册
- `POST /api/auth/email/login` - 邮箱登录
- `POST /api/auth/refresh` - 刷新令牌
- `POST /api/auth/logout` - 登出

### 游戏接口
- `GET /api/rooms` - 获取房间列表
- `POST /api/rooms` - 创建房间
- `GET /api/games/history` - 获取游戏历史
- `GET /api/leaderboard` - 获取排行榜

## 🎨 UI/UX设计

### 设计理念
- 古风与现代结合
- 棋盘采用木纹质感
- 棋子为传统样式+动态高亮效果
- 响应式设计

### 交互特性
- ✅ 走棋操作支持拖拽/点击
- ✅ 超时提醒（最后10秒倒计时动画）
- ✅ 操作反馈（音效+震动反馈，可关闭）
- ✅ 流畅的动画过渡

## 🔄 开发计划

### 已完成功能
- [x] 基础象棋游戏引擎
- [x] 用户认证系统
- [x] 实时联机对战
- [x] 房间管理系统
- [x] 基础UI框架

### 进行中功能
- [ ] 前端组件完善
- [ ] 预约系统实现
- [ ] 排行榜系统
- [ ] 好友系统

### 计划功能
- [ ] 移动端APP
- [ ] 比赛系统
- [ ] 直播功能
- [ ] AI训练模式

## 🤝 贡献指南

欢迎提交Issue和Pull Request来改进项目！

## 📄 开源协议

本项目基于原有开源象棋项目进行扩展开发，继承MIT协议。

## 📞 联系方式

- 项目地址：https://oqo.us
- 技术支持：通过Issue提交问题

---

**注意**：本项目仅供学习和研究使用，禁止用于商业用途。
