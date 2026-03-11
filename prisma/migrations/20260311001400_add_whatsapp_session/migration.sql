-- CreateEnum
CREATE TYPE "WhatsAppStatus" AS ENUM ('disconnected', 'qr_pending', 'connected');

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "status" "WhatsAppStatus" NOT NULL DEFAULT 'disconnected',
    "qrCode" TEXT,
    "qrUpdatedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);
