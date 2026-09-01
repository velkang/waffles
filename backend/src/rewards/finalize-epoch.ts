import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RewardsFinalizerService } from './rewards-finalizer.service';

async function main() {
  const epochId = Number(process.argv[2]);
  if (!Number.isSafeInteger(epochId) || epochId < 0) {
    throw new Error('Usage: pnpm --filter @waffles/api rewards:finalize <epochId>');
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const finalizer = app.get(RewardsFinalizerService);
    await finalizer.finalizeEpoch(epochId);
    const result = await finalizer.submitEpoch(epochId);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
