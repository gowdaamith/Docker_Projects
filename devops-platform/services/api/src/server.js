const express = require("express");
const { Pool } = require("pg");
const Redis = require("ioredis");
const client = require("prom-client");

const app = express();
app.use(express.json());

/* ------------------------
   ENVIRONMENT VARIABLES
-------------------------*/

const PORT = process.env.PORT || 3000;

const DB_HOST = process.env.DB_HOST || "postgres";
const DB_USER = process.env.POSTGRES_USER || "admin";
const DB_PASS = process.env.POSTGRES_PASSWORD || "secret";
const DB_NAME = process.env.POSTGRES_DB || "platform";

const CACHE_HOST = process.env.CACHE_HOST || "redis";

/* ------------------------
   DATABASE CONNECTION
-------------------------*/

const pool = new Pool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  port: 5432
});

/* ------------------------
   REDIS CACHE
-------------------------*/

const redis = new Redis({
  host: CACHE_HOST,
  port: 6379
});

/* ------------------------
   PROMETHEUS METRICS
-------------------------*/

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route"]
});

register.registerMetric(httpRequestCounter);

/* ------------------------
   HEALTH CHECK
-------------------------*/

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    await redis.ping();

    res.json({
      status: "ok",
      db: "connected",
      cache: "connected"
    });

  } catch (err) {

    res.status(500).json({
      status: "error",
      message: err.message
    });

  }
});

/* ------------------------
   GET USERS
-------------------------*/

app.get("/users", async (req, res) => {

  httpRequestCounter.inc({ method: "GET", route: "/users" });

  try {

    const cache = await redis.get("users");

    if (cache) {
      return res.json({
        source: "cache",
        data: JSON.parse(cache)
      });
    }

    const result = await pool.query("SELECT id,name FROM users");

    await redis.set("users", JSON.stringify(result.rows), "EX", 30);

    res.json({
      source: "database",
      data: result.rows
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }
});

/* ------------------------
   CREATE USER
-------------------------*/

app.post("/users", async (req, res) => {

  httpRequestCounter.inc({ method: "POST", route: "/users" });

  try {

    const { name } = req.body;

    const result = await pool.query(
      "INSERT INTO users(name) VALUES($1) RETURNING *",
      [name]
    );

    await redis.del("users");

    res.status(201).json(result.rows[0]);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }
});

/* ------------------------
   PROMETHEUS METRICS
-------------------------*/

app.get("/metrics", async (req, res) => {

  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());

});

/* ------------------------
   SERVER START
-------------------------*/

app.listen(PORT, () => {

  console.log(`API running on port ${PORT}`);
  console.log(`DB host: ${DB_HOST}`);
  console.log(`Cache host: ${CACHE_HOST}`);

});
