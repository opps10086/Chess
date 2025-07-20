-- 中国象棋游戏数据库初始化脚本

CREATE DATABASE IF NOT EXISTS nl_chess CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nl_chess;

-- 用户表
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    nodeloc_user_id VARCHAR(100) UNIQUE,
    nodeloc_username VARCHAR(50),
    avatar_url VARCHAR(255),
    total_games INT DEFAULT 0,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    rating INT DEFAULT 1000,
    consecutive_wins INT DEFAULT 0,
    max_consecutive_wins INT DEFAULT 0,
    rank_level ENUM('新手', '初级', '中级', '高级', '专家', '大师') DEFAULT '新手',
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    INDEX idx_rating (rating DESC),
    INDEX idx_username (username),
    INDEX idx_nodeloc_user_id (nodeloc_user_id)
);

-- 游戏房间表
CREATE TABLE game_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_code VARCHAR(20) NOT NULL UNIQUE,
    room_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255),
    creator_id INT NOT NULL,
    player1_id INT,
    player2_id INT,
    status ENUM('waiting', 'playing', 'finished') DEFAULT 'waiting',
    is_private BOOLEAN DEFAULT FALSE,
    max_spectators INT DEFAULT 50,
    current_spectators INT DEFAULT 0,
    time_limit INT DEFAULT 600, -- 10分钟
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    finished_at TIMESTAMP NULL,
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (player1_id) REFERENCES users(id),
    FOREIGN KEY (player2_id) REFERENCES users(id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at DESC)
);

-- 游戏记录表
CREATE TABLE games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    player1_id INT NOT NULL,
    player2_id INT NOT NULL,
    winner_id INT,
    result ENUM('win', 'loss', 'draw', 'timeout', 'forfeit') NOT NULL,
    moves JSON NOT NULL, -- 存储所有走棋步骤
    duration INT NOT NULL, -- 游戏时长（秒）
    player1_rating_before INT NOT NULL,
    player2_rating_before INT NOT NULL,
    player1_rating_after INT NOT NULL,
    player2_rating_after INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES game_rooms(id),
    FOREIGN KEY (player1_id) REFERENCES users(id),
    FOREIGN KEY (player2_id) REFERENCES users(id),
    FOREIGN KEY (winner_id) REFERENCES users(id),
    INDEX idx_players (player1_id, player2_id),
    INDEX idx_created_at (created_at DESC)
);

-- 预约对局表
CREATE TABLE appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    creator_id INT NOT NULL,
    opponent_id INT,
    appointment_time TIMESTAMP NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    status ENUM('pending', 'confirmed', 'cancelled', 'completed', 'missed') DEFAULT 'pending',
    room_id INT,
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (opponent_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES game_rooms(id),
    INDEX idx_appointment_time (appointment_time),
    INDEX idx_status (status),
    INDEX idx_creator (creator_id)
);

-- 好友关系表
CREATE TABLE friendships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    friend_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id),
    UNIQUE KEY unique_friendship (user_id, friend_id),
    INDEX idx_user_status (user_id, status)
);

-- 棋谱表
CREATE TABLE game_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    moves JSON NOT NULL,
    tags JSON, -- 标签：开局类型、战术等
    is_public BOOLEAN DEFAULT FALSE,
    share_code VARCHAR(50) UNIQUE,
    view_count INT DEFAULT 0,
    like_count INT DEFAULT 0,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_share_code (share_code),
    INDEX idx_public (is_public, created_at DESC)
);

-- 系统消息表
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('appointment', 'friend_request', 'game_invite', 'system') NOT NULL,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_id INT, -- 关联的ID（如预约ID、好友请求ID等）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_unread (user_id, is_read, created_at DESC)
);

-- 邮箱验证码表
CREATE TABLE email_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_code (email, code),
    INDEX idx_expires (expires_at)
);

-- 在线状态表（Redis缓存的备份）
CREATE TABLE user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_id (user_id),
    INDEX idx_session_token (session_token),
    INDEX idx_last_activity (last_activity)
);

-- 排行榜快照表（定期更新）
CREATE TABLE leaderboard_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    rank_position INT NOT NULL,
    rating INT NOT NULL,
    wins INT NOT NULL,
    total_games INT NOT NULL,
    win_rate DECIMAL(5,2) NOT NULL,
    consecutive_wins INT NOT NULL,
    snapshot_date DATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY unique_user_date (user_id, snapshot_date),
    INDEX idx_snapshot_date_rank (snapshot_date, rank_position)
);

-- 插入初始数据
INSERT INTO users (username, email, password_hash, rating, rank_level) VALUES
('AI_初级', 'ai_beginner@system.local', NULL, 800, '初级'),
('AI_中级', 'ai_intermediate@system.local', NULL, 1200, '中级'),
('AI_高级', 'ai_advanced@system.local', NULL, 1600, '高级'),
('AI_专家', 'ai_expert@system.local', NULL, 2000, '专家');

-- 创建索引优化查询性能
CREATE INDEX idx_games_result_time ON games(result, created_at DESC);
CREATE INDEX idx_users_rating_rank ON users(rating DESC, rank_level);
CREATE INDEX idx_appointments_time_status ON appointments(appointment_time, status);