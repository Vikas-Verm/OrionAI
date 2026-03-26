"use strict";

const Sentry = require("@sentry/node");

let sentryEnabled = false;

function getTracesSampleRate() {
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0.1;
}

function initErrorMonitoring() {
  if (!process.env.SENTRY_DSN) return false;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: getTracesSampleRate(),
  });

  sentryEnabled = true;
  return true;
}

function attachErrorMonitoringContext(app) {
  app.use((req, _res, next) => {
    if (sentryEnabled) {
      Sentry.setUser(req.user?.username ? { username: req.user.username } : null);
      Sentry.setTag("route", req.originalUrl || req.url || "unknown");
    }
    next();
  });
}

function attachErrorMonitoringHandler(app) {
  app.use((err, req, _res, next) => {
    captureException(err, {
      path: req.originalUrl,
      method: req.method,
      userId: req.user?.username || null,
    });
    next(err);
  });
}

function captureException(error, context = {}) {
  if (!sentryEnabled || !error) return;
  Sentry.captureException(error, { extra: context });
}

function attachProcessHandlers() {
  process.on("unhandledRejection", (reason) => {
    const error =
      reason instanceof Error ? reason : new Error(String(reason || "Unhandled rejection"));
    captureException(error, { source: "process.unhandledRejection" });
  });

  process.on("uncaughtException", (error) => {
    captureException(error, { source: "process.uncaughtException" });
  });
}

module.exports = {
  initErrorMonitoring,
  attachErrorMonitoringContext,
  attachErrorMonitoringHandler,
  attachProcessHandlers,
  captureException,
};
