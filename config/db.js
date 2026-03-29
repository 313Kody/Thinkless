const mysql = require("mysql2/promise");
require("dotenv").config();

let pool = null;

const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      acquireTimeout: 60000,
      timeout: 60000,
    });
  }
  return pool;
};

module.exports = { getPool };
