-- AlterTable
ALTER TABLE "chunks" ADD COLUMN     "dim" INTEGER;

-- CreateIndex
CREATE INDEX "chunks_dim_idx" ON "chunks"("dim");

-- نشيل قيد الأبعاد الثابت عن عمود المتجه.
-- Prisma ما يكتشف تغيير أنواع Unsupported، فنكتبها يدويًا.
-- الهدف: المشروع يشتغل مع أي نموذج تضمين مهما كانت أبعاده.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'chunks' AND column_name = 'embedding') THEN
    ALTER TABLE "chunks" ALTER COLUMN "embedding" TYPE vector;
  END IF;
END $$;
