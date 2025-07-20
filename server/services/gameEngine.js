const logger = require('../utils/logger');

// 中国象棋游戏引擎类
class GameEngine {
    constructor(roomId, creatorId) {
        this.roomId = roomId;
        this.creatorId = creatorId;
        this.player1Id = null;
        this.player2Id = null;
        this.currentTurn = 1; // 1为红方，-1为黑方
        this.gameStatus = 'waiting'; // waiting, playing, finished
        this.startTime = null;
        this.endTime = null;
        this.moves = []; // 记录所有走棋步骤
        this.winner = null;
        this.gameResult = null;
        this.regretRequest = null; // 悔棋请求状态
        
        // 初始化棋盘
        this.initBoard();
    }

    // 初始化棋盘
    initBoard() {
        // 标准中国象棋开局棋盘
        this.board = [
            [-1, -2, -3, -4, -5, -4, -3, -2, -1],
            [0,   0,  0,  0,  0,  0,  0,  0,  0],
            [0,  -6,  0,  0,  0,  0,  0, -6,  0],
            [-7,  0, -7,  0, -7,  0, -7,  0, -7],
            [0,   0,  0,  0,  0,  0,  0,  0,  0],
            [0,   0,  0,  0,  0,  0,  0,  0,  0],
            [7,   0,  7,  0,  7,  0,  7,  0,  7],
            [0,   6,  0,  0,  0,  0,  0,  6,  0],
            [0,   0,  0,  0,  0,  0,  0,  0,  0],
            [1,   2,  3,  4,  5,  4,  3,  2,  1]
        ];

        // 棋子编码说明:
        // 1: 红帅, 2: 红仕, 3: 红相, 4: 红马, 5: 红车, 6: 红炮, 7: 红兵
        // -1: 黑将, -2: 黑士, -3: 黑象, -4: 黑马, -5: 黑车, -6: 黑炮, -7: 黑卒
        // 0: 空位
    }

    // 开始游戏
    startGame(player1Id, player2Id) {
        this.player1Id = player1Id;
        this.player2Id = player2Id;
        this.gameStatus = 'playing';
        this.startTime = new Date();
        this.currentTurn = 1; // 红方先行

        logger.gameEvent('游戏开始', {
            roomId: this.roomId,
            player1Id,
            player2Id
        });
    }

    // 检查是否轮到该玩家走棋
    isPlayerTurn(playerId) {
        if (this.gameStatus !== 'playing') return false;
        
        // 红方(1)对应player1，黑方(-1)对应player2
        if (this.currentTurn === 1) {
            return playerId === this.player1Id;
        } else {
            return playerId === this.player2Id;
        }
    }

    // 执行走棋
    makeMove(playerId, from, to) {
        try {
            // 验证游戏状态
            if (this.gameStatus !== 'playing') {
                return { success: false, message: '游戏未开始或已结束' };
            }

            // 验证轮次
            if (!this.isPlayerTurn(playerId)) {
                return { success: false, message: '还没轮到您走棋' };
            }

            // 验证坐标格式
            if (!this.isValidPosition(from) || !this.isValidPosition(to)) {
                return { success: false, message: '坐标格式不正确' };
            }

            const fromX = from.x;
            const fromY = from.y;
            const toX = to.x;
            const toY = to.y;

            // 验证起始位置有棋子
            const piece = this.board[fromY][fromX];
            if (piece === 0) {
                return { success: false, message: '起始位置没有棋子' };
            }

            // 验证棋子归属
            if ((this.currentTurn === 1 && piece < 0) || (this.currentTurn === -1 && piece > 0)) {
                return { success: false, message: '不能移动对方的棋子' };
            }

            // 验证走法是否合法
            if (!this.isValidMove(fromX, fromY, toX, toY, piece)) {
                return { success: false, message: '走法不符合棋子规则' };
            }

            // 验证移动后是否会导致将军（自己的将/帅被攻击）
            if (this.wouldBeInCheck(fromX, fromY, toX, toY, this.currentTurn)) {
                return { success: false, message: '此走法会导致将军，不能执行' };
            }

            // 执行移动
            const capturedPiece = this.board[toY][toX];
            this.board[toY][toX] = piece;
            this.board[fromY][fromX] = 0;

            // 记录走棋步骤
            const move = {
                playerId,
                from: { x: fromX, y: fromY },
                to: { x: toX, y: toY },
                piece,
                capturedPiece,
                timestamp: new Date(),
                moveNumber: this.moves.length + 1
            };
            this.moves.push(move);

            // 切换回合
            this.currentTurn = -this.currentTurn;

            // 检查游戏是否结束
            this.checkGameEnd();

            return {
                success: true,
                move,
                gameState: this.getGameState()
            };

        } catch (error) {
            logger.error('执行走棋失败:', error);
            return { success: false, message: '走棋失败' };
        }
    }

    // 验证位置是否有效
    isValidPosition(pos) {
        return pos && 
               typeof pos.x === 'number' && 
               typeof pos.y === 'number' &&
               pos.x >= 0 && pos.x < 9 && 
               pos.y >= 0 && pos.y < 10;
    }

    // 验证走法是否合法
    isValidMove(fromX, fromY, toX, toY, piece) {
        // 不能移动到相同位置
        if (fromX === toX && fromY === toY) {
            return false;
        }

        // 不能吃自己的棋子
        const targetPiece = this.board[toY][toX];
        if (targetPiece !== 0 && ((piece > 0 && targetPiece > 0) || (piece < 0 && targetPiece < 0))) {
            return false;
        }

        const absType = Math.abs(piece);
        
        switch (absType) {
            case 1: // 将/帅
                return this.isValidGeneralMove(fromX, fromY, toX, toY, piece);
            case 2: // 士/仕
                return this.isValidAdvisorMove(fromX, fromY, toX, toY, piece);
            case 3: // 象/相
                return this.isValidElephantMove(fromX, fromY, toX, toY, piece);
            case 4: // 马
                return this.isValidHorseMove(fromX, fromY, toX, toY);
            case 5: // 车
                return this.isValidRookMove(fromX, fromY, toX, toY);
            case 6: // 炮
                return this.isValidCannonMove(fromX, fromY, toX, toY);
            case 7: // 兵/卒
                return this.isValidPawnMove(fromX, fromY, toX, toY, piece);
            default:
                return false;
        }
    }

    // 将/帅的走法验证
    isValidGeneralMove(fromX, fromY, toX, toY, piece) {
        // 只能在九宫格内移动
        const isRedGeneral = piece > 0;
        const minY = isRedGeneral ? 7 : 0;
        const maxY = isRedGeneral ? 9 : 2;
        
        if (toX < 3 || toX > 5 || toY < minY || toY > maxY) {
            return false;
        }

        // 只能移动一格，且只能横向或纵向
        const deltaX = Math.abs(toX - fromX);
        const deltaY = Math.abs(toY - fromY);
        
        return (deltaX === 1 && deltaY === 0) || (deltaX === 0 && deltaY === 1);
    }

    // 士/仕的走法验证
    isValidAdvisorMove(fromX, fromY, toX, toY, piece) {
        // 只能在九宫格内移动
        const isRedAdvisor = piece > 0;
        const minY = isRedAdvisor ? 7 : 0;
        const maxY = isRedAdvisor ? 9 : 2;
        
        if (toX < 3 || toX > 5 || toY < minY || toY > maxY) {
            return false;
        }

        // 只能斜向移动一格
        const deltaX = Math.abs(toX - fromX);
        const deltaY = Math.abs(toY - fromY);
        
        return deltaX === 1 && deltaY === 1;
    }

    // 象/相的走法验证
    isValidElephantMove(fromX, fromY, toX, toY, piece) {
        // 不能过河
        const isRedElephant = piece > 0;
        if (isRedElephant && toY < 5) return false;
        if (!isRedElephant && toY > 4) return false;

        // 只能斜向移动两格
        const deltaX = Math.abs(toX - fromX);
        const deltaY = Math.abs(toY - fromY);
        
        if (deltaX !== 2 || deltaY !== 2) return false;

        // 检查象眼是否被堵
        const eyeX = fromX + (toX - fromX) / 2;
        const eyeY = fromY + (toY - fromY) / 2;
        
        return this.board[eyeY][eyeX] === 0;
    }

    // 马的走法验证
    isValidHorseMove(fromX, fromY, toX, toY) {
        const deltaX = Math.abs(toX - fromX);
        const deltaY = Math.abs(toY - fromY);
        
        // 马走日字
        if (!((deltaX === 2 && deltaY === 1) || (deltaX === 1 && deltaY === 2))) {
            return false;
        }

        // 检查马脚是否被堵
        let legX, legY;
        if (deltaX === 2) {
            legX = fromX + (toX - fromX) / 2;
            legY = fromY;
        } else {
            legX = fromX;
            legY = fromY + (toY - fromY) / 2;
        }

        return this.board[legY][legX] === 0;
    }

    // 车的走法验证
    isValidRookMove(fromX, fromY, toX, toY) {
        // 只能横向或纵向移动
        if (fromX !== toX && fromY !== toY) {
            return false;
        }

        // 检查路径是否有障碍物
        if (fromX === toX) {
            // 纵向移动
            const minY = Math.min(fromY, toY);
            const maxY = Math.max(fromY, toY);
            for (let y = minY + 1; y < maxY; y++) {
                if (this.board[y][fromX] !== 0) {
                    return false;
                }
            }
        } else {
            // 横向移动
            const minX = Math.min(fromX, toX);
            const maxX = Math.max(fromX, toX);
            for (let x = minX + 1; x < maxX; x++) {
                if (this.board[fromY][x] !== 0) {
                    return false;
                }
            }
        }

        return true;
    }

    // 炮的走法验证
    isValidCannonMove(fromX, fromY, toX, toY) {
        // 只能横向或纵向移动
        if (fromX !== toX && fromY !== toY) {
            return false;
        }

        const targetPiece = this.board[toY][toX];
        let barrierCount = 0;

        if (fromX === toX) {
            // 纵向移动
            const minY = Math.min(fromY, toY);
            const maxY = Math.max(fromY, toY);
            for (let y = minY + 1; y < maxY; y++) {
                if (this.board[y][fromX] !== 0) {
                    barrierCount++;
                }
            }
        } else {
            // 横向移动
            const minX = Math.min(fromX, toX);
            const maxX = Math.max(fromX, toX);
            for (let x = minX + 1; x < maxX; x++) {
                if (this.board[fromY][x] !== 0) {
                    barrierCount++;
                }
            }
        }

        // 如果目标位置有棋子，需要恰好一个炮架
        if (targetPiece !== 0) {
            return barrierCount === 1;
        } else {
            // 如果目标位置为空，不能有炮架
            return barrierCount === 0;
        }
    }

    // 兵/卒的走法验证
    isValidPawnMove(fromX, fromY, toX, toY, piece) {
        const isRedPawn = piece > 0;
        const deltaX = Math.abs(toX - fromX);
        const deltaY = toY - fromY;

        // 只能移动一格
        if (deltaX + Math.abs(deltaY) !== 1) {
            return false;
        }

        // 红兵只能向上走，黑卒只能向下走
        if (isRedPawn) {
            // 红兵未过河时只能向前
            if (fromY > 4 && deltaY !== -1) {
                return false;
            }
            // 红兵过河后可以横向移动，但不能后退
            if (fromY <= 4 && deltaY > 0) {
                return false;
            }
        } else {
            // 黑卒未过河时只能向前
            if (fromY < 5 && deltaY !== 1) {
                return false;
            }
            // 黑卒过河后可以横向移动，但不能后退
            if (fromY >= 5 && deltaY < 0) {
                return false;
            }
        }

        return true;
    }

    // 检查移动后是否会导致将军
    wouldBeInCheck(fromX, fromY, toX, toY, side) {
        // 临时执行移动
        const originalPiece = this.board[toY][toX];
        this.board[toY][toX] = this.board[fromY][fromX];
        this.board[fromY][fromX] = 0;

        // 检查是否将军
        const inCheck = this.isInCheck(side);

        // 恢复棋盘
        this.board[fromY][fromX] = this.board[toY][toX];
        this.board[toY][toX] = originalPiece;

        return inCheck;
    }

    // 检查指定方是否被将军
    isInCheck(side) {
        // 找到将/帅的位置
        const generalType = side > 0 ? 1 : -1;
        let generalX, generalY;
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                if (this.board[y][x] === generalType) {
                    generalX = x;
                    generalY = y;
                    break;
                }
            }
            if (generalX !== undefined) break;
        }

        if (generalX === undefined) {
            return false; // 找不到将/帅
        }

        // 检查是否有敌方棋子能攻击到将/帅
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                const piece = this.board[y][x];
                if (piece !== 0 && ((side > 0 && piece < 0) || (side < 0 && piece > 0))) {
                    if (this.isValidMove(x, y, generalX, generalY, piece)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    // 检查游戏是否结束
    checkGameEnd() {
        // 检查是否有将/帅被吃掉
        let redGeneral = false, blackGeneral = false;
        
        for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
                if (this.board[y][x] === 1) redGeneral = true;
                if (this.board[y][x] === -1) blackGeneral = true;
            }
        }

        if (!redGeneral) {
            this.endGame(-1, 'checkmate'); // 黑方胜
            return;
        }
        
        if (!blackGeneral) {
            this.endGame(1, 'checkmate'); // 红方胜
            return;
        }

        // 检查是否被将死（无法移动且被将军）
        if (this.isInCheck(this.currentTurn) && this.isCheckmate(this.currentTurn)) {
            this.endGame(-this.currentTurn, 'checkmate');
            return;
        }

        // 检查是否为困毙（无法移动但未被将军）
        if (!this.isInCheck(this.currentTurn) && this.isStalemate(this.currentTurn)) {
            this.endGame(0, 'stalemate'); // 平局
            return;
        }
    }

    // 检查是否被将死
    isCheckmate(side) {
        // 遍历所有己方棋子，看是否有合法走法
        for (let fromY = 0; fromY < 10; fromY++) {
            for (let fromX = 0; fromX < 9; fromX++) {
                const piece = this.board[fromY][fromX];
                if (piece === 0 || ((side > 0 && piece < 0) || (side < 0 && piece > 0))) {
                    continue;
                }

                // 尝试所有可能的移动
                for (let toY = 0; toY < 10; toY++) {
                    for (let toX = 0; toX < 9; toX++) {
                        if (this.isValidMove(fromX, fromY, toX, toY, piece) &&
                            !this.wouldBeInCheck(fromX, fromY, toX, toY, side)) {
                            return false; // 找到合法走法，不是将死
                        }
                    }
                }
            }
        }
        return true; // 没有合法走法，是将死
    }

    // 检查是否为困毙
    isStalemate(side) {
        // 与将死检查类似，但要求当前不被将军
        return this.isCheckmate(side);
    }

    // 结束游戏
    endGame(winner, reason) {
        this.gameStatus = 'finished';
        this.endTime = new Date();
        this.winner = winner;
        this.gameResult = {
            winner,
            reason,
            duration: this.endTime - this.startTime,
            moves: this.moves.length
        };

        logger.gameEvent('游戏结束', {
            roomId: this.roomId,
            winner,
            reason,
            duration: this.gameResult.duration
        });
    }

    // 请求悔棋
    requestRegret(playerId) {
        if (this.gameStatus !== 'playing') {
            return { success: false, message: '游戏未进行中' };
        }

        if (this.moves.length === 0) {
            return { success: false, message: '游戏刚开始，无法悔棋' };
        }

        if (this.regretRequest && this.regretRequest.status === 'pending') {
            return { success: false, message: '已有悔棋请求等待处理' };
        }

        this.regretRequest = {
            playerId,
            status: 'pending',
            timestamp: new Date()
        };

        return { success: true, message: '悔棋请求已发送' };
    }

    // 回应悔棋请求
    respondToRegret(playerId, accept) {
        if (!this.regretRequest || this.regretRequest.status !== 'pending') {
            return { success: false, message: '没有待处理的悔棋请求' };
        }

        // 验证回应者不是请求者
        if (this.regretRequest.playerId === playerId) {
            return { success: false, message: '不能回应自己的悔棋请求' };
        }

        if (accept) {
            // 执行悔棋
            if (this.moves.length > 0) {
                const lastMove = this.moves.pop();
                
                // 恢复棋盘状态
                this.board[lastMove.from.y][lastMove.from.x] = lastMove.piece;
                this.board[lastMove.to.y][lastMove.to.x] = lastMove.capturedPiece;
                
                // 切换回合
                this.currentTurn = -this.currentTurn;
            }
            
            this.regretRequest = null;
            return { success: true, message: '悔棋成功' };
        } else {
            this.regretRequest = null;
            return { success: true, message: '悔棋请求被拒绝' };
        }
    }

    // 认输
    surrender(playerId) {
        if (this.gameStatus !== 'playing') {
            return { success: false, message: '游戏未进行中' };
        }

        // 确定胜负
        const winner = playerId === this.player1Id ? this.player2Id : this.player1Id;
        this.endGame(playerId === this.player1Id ? -1 : 1, 'surrender');

        return { 
            success: true, 
            message: '认输成功',
            result: this.getGameResult()
        };
    }

    // 获取对手ID
    getOpponent(playerId) {
        return playerId === this.player1Id ? this.player2Id : this.player1Id;
    }

    // 获取游戏状态
    getGameState() {
        return {
            roomId: this.roomId,
            board: this.board,
            currentTurn: this.currentTurn,
            gameStatus: this.gameStatus,
            player1Id: this.player1Id,
            player2Id: this.player2Id,
            moves: this.moves,
            moveCount: this.moves.length,
            startTime: this.startTime,
            regretRequest: this.regretRequest
        };
    }

    // 获取游戏结果
    getGameResult() {
        if (this.gameStatus !== 'finished') {
            return null;
        }

        return {
            roomId: this.roomId,
            player1Id: this.player1Id,
            player2Id: this.player2Id,
            winner: this.winner,
            winnerId: this.winner === 1 ? this.player1Id : (this.winner === -1 ? this.player2Id : null),
            result: this.gameResult.reason,
            duration: Math.floor(this.gameResult.duration / 1000), // 转换为秒
            moves: this.moves,
            endTime: this.endTime,
            // 这里需要从数据库获取玩家等级分变化，暂时用占位符
            player1RatingBefore: 1000,
            player2RatingBefore: 1000,
            player1RatingAfter: 1000,
            player2RatingAfter: 1000
        };
    }

    // 获取所有走棋记录
    getMoves() {
        return this.moves;
    }

    // 检查游戏是否结束
    isGameOver() {
        return this.gameStatus === 'finished';
    }
}

module.exports = GameEngine;