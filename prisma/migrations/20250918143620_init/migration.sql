-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'PEMINJAM', 'APPROVER');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('AKTIF', 'NONAKTIF');

-- CreateEnum
CREATE TYPE "public"."Condition" AS ENUM ('BAIK', 'RUSAK_RINGAN', 'RUSAK_BERAT', 'HILANG');

-- CreateEnum
CREATE TYPE "public"."AssetStatus" AS ENUM ('TERSEDIA', 'DIPINJAM', 'TIDAK_AKTIF');

-- CreateEnum
CREATE TYPE "public"."ItemType" AS ENUM ('ASET', 'JASA');

-- CreateEnum
CREATE TYPE "public"."BookingType" AS ENUM ('ASET', 'JASA', 'CAMPUR');

-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('MENUNGGU', 'DIKONFIRMASI', 'DITOLAK', 'DIBATALKAN', 'SELESAI');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'QRIS');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."FineType" AS ENUM ('TELAT', 'KERUSAKAN', 'KEHILANGAN', 'LAINNYA');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('EMAIL', 'WA', 'APP');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('BOOKING', 'PAYMENT', 'RETURN', 'SYSTEM');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'PEMINJAM',
    "status" "public"."UserStatus" NOT NULL DEFAULT 'AKTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Asset" (
    "id" UUID NOT NULL,
    "categoryId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT,
    "acquisitionDate" TIMESTAMP(3),
    "conditionNow" "public"."Condition" NOT NULL DEFAULT 'BAIK',
    "status" "public"."AssetStatus" NOT NULL DEFAULT 'TERSEDIA',
    "dailyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 1,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Service" (
    "id" UUID NOT NULL,
    "categoryId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "public"."BookingType" NOT NULL DEFAULT 'CAMPUR',
    "startDatetime" TIMESTAMP(3) NOT NULL,
    "endDatetime" TIMESTAMP(3) NOT NULL,
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'MENUNGGU',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingItem" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "itemType" "public"."ItemType" NOT NULL,
    "assetId" UUID,
    "serviceId" UUID,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "public"."PaymentMethod" NOT NULL,
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "referenceNo" TEXT,
    "proofUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Return" (
    "id" UUID NOT NULL,
    "bookingItemId" UUID NOT NULL,
    "returnedAt" TIMESTAMP(3) NOT NULL,
    "conditionAfter" "public"."Condition" NOT NULL DEFAULT 'BAIK',
    "notes" TEXT,
    "verifiedBy" UUID,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Fine" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "returnId" UUID,
    "type" "public"."FineType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paymentId" UUID,
    "notes" TEXT,

    CONSTRAINT "Fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Feedback" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL DEFAULT 'APP',
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_code_key" ON "public"."Asset"("code");

-- CreateIndex
CREATE INDEX "idx_assets_category" ON "public"."Asset"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_key" ON "public"."Service"("code");

-- CreateIndex
CREATE INDEX "idx_services_category" ON "public"."Service"("categoryId");

-- CreateIndex
CREATE INDEX "idx_bookings_user_status" ON "public"."Booking"("userId", "status", "startDatetime");

-- CreateIndex
CREATE INDEX "idx_bi_booking" ON "public"."BookingItem"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_booking_asset" ON "public"."BookingItem"("bookingId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_booking_service" ON "public"."BookingItem"("bookingId", "serviceId");

-- CreateIndex
CREATE INDEX "idx_payments_booking" ON "public"."Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Return_bookingItemId_key" ON "public"."Return"("bookingItemId");

-- CreateIndex
CREATE INDEX "idx_returns_bi" ON "public"."Return"("bookingItemId");

-- CreateIndex
CREATE INDEX "idx_fines_booking" ON "public"."Fine"("bookingId");

-- AddForeignKey
ALTER TABLE "public"."Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Return" ADD CONSTRAINT "Return_bookingItemId_fkey" FOREIGN KEY ("bookingItemId") REFERENCES "public"."BookingItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Return" ADD CONSTRAINT "Return_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fine" ADD CONSTRAINT "Fine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fine" ADD CONSTRAINT "Fine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "public"."Return"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fine" ADD CONSTRAINT "Fine_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
