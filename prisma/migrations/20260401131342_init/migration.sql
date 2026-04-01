-- CreateTable
CREATE TABLE "BusTrafficSnapshot" (
    "id" SERIAL NOT NULL,
    "stationId" INTEGER NOT NULL,
    "stationName" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "routeCount" INTEGER NOT NULL,
    "activeCount" INTEGER NOT NULL,
    "avgCrowded" DOUBLE PRECISION NOT NULL,
    "score" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusTrafficSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusTrafficSnapshot_stationId_recordedAt_idx" ON "BusTrafficSnapshot"("stationId", "recordedAt");
