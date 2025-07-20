const Redis = require('redis');
const config = require('./config');
const logger = require('../utils/logger');

// 创建Redis客户端
const client = Redis.createClient({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    retryDelayOnFailover: config.redis.retryDelayOnFailover,
    enableReadyCheck: config.redis.enableReadyCheck,
    maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
    lazyConnect: true,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

// 连接事件监听
client.on('connect', () => {
    logger.info('Redis连接成功');
});

client.on('ready', () => {
    logger.info('Redis准备就绪');
});

client.on('error', (err) => {
    logger.error('Redis连接错误:', err);
});

client.on('close', () => {
    logger.warn('Redis连接关闭');
});

client.on('reconnecting', () => {
    logger.info('Redis重新连接中...');
});

// 连接到Redis
async function connect() {
    try {
        await client.connect();
        logger.info('Redis客户端连接成功');
    } catch (error) {
        logger.error('Redis连接失败:', error);
        throw error;
    }
}

// Redis操作封装
const redisOperations = {
    // 基础操作
    async get(key) {
        try {
            return await client.get(key);
        } catch (error) {
            logger.error('Redis GET操作失败:', error);
            return null;
        }
    },

    async set(key, value, ttl = null) {
        try {
            if (ttl) {
                return await client.setEx(key, ttl, value);
            }
            return await client.set(key, value);
        } catch (error) {
            logger.error('Redis SET操作失败:', error);
            return false;
        }
    },

    async del(key) {
        try {
            return await client.del(key);
        } catch (error) {
            logger.error('Redis DEL操作失败:', error);
            return 0;
        }
    },

    async exists(key) {
        try {
            return await client.exists(key);
        } catch (error) {
            logger.error('Redis EXISTS操作失败:', error);
            return 0;
        }
    },

    async expire(key, seconds) {
        try {
            return await client.expire(key, seconds);
        } catch (error) {
            logger.error('Redis EXPIRE操作失败:', error);
            return 0;
        }
    },

    // 哈希操作
    async hget(key, field) {
        try {
            return await client.hGet(key, field);
        } catch (error) {
            logger.error('Redis HGET操作失败:', error);
            return null;
        }
    },

    async hset(key, field, value) {
        try {
            return await client.hSet(key, field, value);
        } catch (error) {
            logger.error('Redis HSET操作失败:', error);
            return 0;
        }
    },

    async hgetall(key) {
        try {
            return await client.hGetAll(key);
        } catch (error) {
            logger.error('Redis HGETALL操作失败:', error);
            return {};
        }
    },

    async hdel(key, field) {
        try {
            return await client.hDel(key, field);
        } catch (error) {
            logger.error('Redis HDEL操作失败:', error);
            return 0;
        }
    },

    // 集合操作
    async sadd(key, member) {
        try {
            return await client.sAdd(key, member);
        } catch (error) {
            logger.error('Redis SADD操作失败:', error);
            return 0;
        }
    },

    async srem(key, member) {
        try {
            return await client.sRem(key, member);
        } catch (error) {
            logger.error('Redis SREM操作失败:', error);
            return 0;
        }
    },

    async smembers(key) {
        try {
            return await client.sMembers(key);
        } catch (error) {
            logger.error('Redis SMEMBERS操作失败:', error);
            return [];
        }
    },

    async sismember(key, member) {
        try {
            return await client.sIsMember(key, member);
        } catch (error) {
            logger.error('Redis SISMEMBER操作失败:', error);
            return false;
        }
    },

    // 有序集合操作
    async zadd(key, score, member) {
        try {
            return await client.zAdd(key, { score, value: member });
        } catch (error) {
            logger.error('Redis ZADD操作失败:', error);
            return 0;
        }
    },

    async zrem(key, member) {
        try {
            return await client.zRem(key, member);
        } catch (error) {
            logger.error('Redis ZREM操作失败:', error);
            return 0;
        }
    },

    async zrange(key, start, stop, withScores = false) {
        try {
            if (withScores) {
                return await client.zRangeWithScores(key, start, stop);
            }
            return await client.zRange(key, start, stop);
        } catch (error) {
            logger.error('Redis ZRANGE操作失败:', error);
            return [];
        }
    },

    async zrevrange(key, start, stop, withScores = false) {
        try {
            if (withScores) {
                return await client.zRevRangeWithScores(key, start, stop);
            }
            return await client.zRevRange(key, start, stop);
        } catch (error) {
            logger.error('Redis ZREVRANGE操作失败:', error);
            return [];
        }
    },

    // 列表操作
    async lpush(key, value) {
        try {
            return await client.lPush(key, value);
        } catch (error) {
            logger.error('Redis LPUSH操作失败:', error);
            return 0;
        }
    },

    async rpush(key, value) {
        try {
            return await client.rPush(key, value);
        } catch (error) {
            logger.error('Redis RPUSH操作失败:', error);
            return 0;
        }
    },

    async lrange(key, start, stop) {
        try {
            return await client.lRange(key, start, stop);
        } catch (error) {
            logger.error('Redis LRANGE操作失败:', error);
            return [];
        }
    },

    // 发布订阅
    async publish(channel, message) {
        try {
            return await client.publish(channel, message);
        } catch (error) {
            logger.error('Redis PUBLISH操作失败:', error);
            return 0;
        }
    }
};

// 初始化连接
connect().catch(err => {
    logger.error('Redis初始化失败:', err);
});

module.exports = {
    client,
    connect,
    ...redisOperations
};