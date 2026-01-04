import "dotenv/config";
import express from "express";
import cors from "cors";
import { jobsRouter } from "./routers/jobs.router.js";
import { config } from "./config.js";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    mode: config.ENRICHMENT_MODE,
    ts: new Date().toISOString(),
  }),
);
app.use("/api/jobs", jobsRouter);

app.listen(config.PORT, () =>
  console.log(
    `API listening on http://localhost:${config.PORT} (mode=${config.ENRICHMENT_MODE})`,
  ),
);
