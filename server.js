require('dotenv').config();

const express = require('express');
const pgPool = require('./db/postgres');
const mysqlPool = require('./db/mysql');
const redisClient = require('./db/redis');
const { ensurePostgresSchema, ensureMysqlSchema } = require('./db/schema');
const errorHandler = require('./middleware/errorHandler');
const createCacheRouter = require('./routes/cache');
const createUsersRouter = require('./routes/users');
const createCarsRouter = require('./routes/cars');
const createGpsRouter = require('./routes/gps');
const createTravelRequestsRouter = require('./routes/travelRequests');
const createGpsDashboardRouter = require('./routes/gpsDashboard');
const createPlacesRouter = require('./routes/places');
const createProductsRouter = require('./routes/products');
const createDeliveryNotesRouter = require('./routes/deliveryNotes');
const createAuthRouter = require('./routes/auth');
const createFuelPricesRouter = require('./routes/fuelPrices');
const createProjectJobsRouter = require('./routes/projectJobs');
const createAiRouter = require('./routes/ai');
process.env.AI_GPT_PUBLIC_BASE_PATH = process.env.AI_GPT_PUBLIC_BASE_PATH || '/ai-gpt-app';
const aiGptApp = require('./AI-GPT-App/server');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use('/ai-gpt-app', aiGptApp);
app.use(express.json({ limit: '25mb' }));

app.use('/api', createCacheRouter({ pgPool, redisClient }));
app.use('/api', createAuthRouter({ pgPool, mysqlPool }));
app.use('/api', createUsersRouter({ pgPool, mysqlPool }));
app.use('/api', createCarsRouter({ mysqlPool, pgPool }));
app.use('/api', createGpsRouter());
app.use('/api', createTravelRequestsRouter({ mysqlPool }));
app.use('/api', createGpsDashboardRouter());
app.use('/api', createPlacesRouter());
app.use('/api', createFuelPricesRouter());
app.use('/api', createProductsRouter({ pgPool }));
app.use('/api', createProjectJobsRouter({ pgPool }));
app.use('/api', createDeliveryNotesRouter({ mysqlPool }));
app.use('/api', createAiRouter());
app.use(errorHandler);

async function startServer() {
  app.listen(port, () => {
    console.log('');
    console.log('================================');
    console.log(`Server is running on http://localhost:${port}`);
    console.log(`Open the web app at http://localhost:${port}/index.html`);
    console.log('================================');
    console.log('');
  });

  try {
    await ensurePostgresSchema();
    console.log('Connected to PostgreSQL successfully (read-only mode).');
  } catch (err) {
    console.warn('Warning: PostgreSQL is unavailable. Employees/Cars APIs may not work:', err.message);
  }

  try {
    await ensureMysqlSchema();
    console.log('Connected to MySQL and verified transaction tables successfully.');
  } catch (err) {
    console.warn('Warning: MySQL is unavailable. Travel request APIs may not work:', err.message);
  }

  try {
    await redisClient.connect();
    console.log('Connected to Redis successfully.');
  } catch (err) {
    console.warn('Warning: Redis is unavailable. Cache API will skip Redis:', err.message);
  }
}

startServer();
