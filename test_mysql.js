require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('Testing MySQL connection...');
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;
  const port = process.env.MYSQL_PORT || 3306;

  console.log(`Connecting to Host: ${host}, Port: ${port}, User: ${user}, Database: ${database}`);

  try {
    const connection = await mysql.createConnection({
      host,
      user,
      password,
      database,
      port,
      connectTimeout: 5000,
    });

    console.log('Connection to MySQL successful.');

    const [rows] = await connection.execute('SHOW TABLES;');
    console.log('Tables fetched successfully.');
    console.log(rows);

    await connection.end();
  } catch (error) {
    console.error('Connection failed.');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    process.exitCode = 1;
  }
}

testConnection();
