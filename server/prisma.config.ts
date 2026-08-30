import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const here = path.dirname(fileURLToPath(import.meta.url));

// ملف الإعدادات في جذر المستودع، مو داخل مجلد server
loadEnv({ path: path.resolve(here, '..', '.env') });

export default defineConfig({
  schema: path.join(here, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(here, 'prisma', 'migrations'),
  },
});
