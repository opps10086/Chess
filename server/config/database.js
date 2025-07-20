const mysql = require('mysql2/promise');
const config = require('./config');
const logger = require('../utils/logger');

// 创建连接池
const pool = mysql.createPool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    charset: config.database.charset,
    timezone: config.database.timezone,
    acquireTimeout: config.database.acquireTimeout,
    timeout: config.database.timeout,
    reconnect: config.database.reconnect,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: false,
    namedPlaceholders: true
});

// 测试数据库连接
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        logger.info('数据库连接成功');
        connection.release();
        return true;
    } catch (error) {
        logger.error('数据库连接失败:', error);
        return false;
    }
}

// 执行查询的封装函数
async function query(sql, params = []) {
    try {
        const [rows, fields] = await pool.execute(sql, params);
        return rows;
    } catch (error) {
        logger.error('数据库查询错误:', error);
        throw error;
    }
}

// 执行事务
async function transaction(callback) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// 获取单条记录
async function findOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

// 获取多条记录
async function findMany(sql, params = []) {
    return await query(sql, params);
}

// 插入记录
async function insert(table, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    const result = await query(sql, values);
    return result.insertId;
}

// 更新记录
async function update(table, data, where, whereParams = []) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;
    const result = await query(sql, [...values, ...whereParams]);
    return result.affectedRows;
}

// 删除记录
async function remove(table, where, whereParams = []) {
    const sql = `DELETE FROM ${table} WHERE ${where}`;
    const result = await query(sql, whereParams);
    return result.affectedRows;
}

// 关闭连接池
async function close() {
    await pool.end();
    logger.info('数据库连接池已关闭');
}

// 初始化数据库连接
testConnection();

module.exports = {
    pool,
    query,
    transaction,
    findOne,
    findMany,
    insert,
    update,
    remove,
    close,
    testConnection
};