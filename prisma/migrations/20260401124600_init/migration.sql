-- CreateTable
CREATE TABLE "BusTrafficSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stationId" INTEGER NOT NULL,
    "stationName" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "routeCount" INTEGER NOT NULL,
    "activeCount" INTEGER NOT NULL,
    "avgCrowded" REAL NOT NULL,
    "score" INTEGER NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "BusTrafficSnapshot_stationId_recordedAt_idx" ON "BusTrafficSnapshot"("stationId", "recordedAt");
