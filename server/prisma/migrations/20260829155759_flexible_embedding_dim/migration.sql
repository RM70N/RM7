-- AlterTable
ALTER TABLE "chunks" ADD COLUMN     "dim" INTEGER;

-- CreateIndex
CREATE INDEX "chunks_dim_idx" ON "chunks"("dim");

-- نشيل قيد الأبعاد الثابت عن عمود المتجه.
-- Prisma ما يكتشف تغيير أنواع Unsupported، فنكتبها يدويًا.
-- الهدف: المشروع يشتغل مع أي نموذج تضمين مهما كانت أبعاده.
ALTER TABLE "chunks" ALTER COLUMN "embedding" TYPE vector;
