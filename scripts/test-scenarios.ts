import { RFIDEngine, RFIDReadConfig } from '../lib/simulator/rfid-engine';
import {
  scenarioClientReturn,
  scenarioFullDay,
  scenarioMorningDispatch,
  scenarioProductionCycle,
  scenarioStressTest,
} from '../lib/simulator/scenarios';

function parseArg(name: string, fallback: string): string {
  const token = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!token) return fallback;
  return token.slice(name.length + 3);
}

async function smokeRFIDEngine() {
  const tags = Array.from({ length: 120 }, (_, i) => `TG-SMOKE-${String(i + 1).padStart(5, '0')}`);
  const engine = new RFIDEngine();

  const gateCfg: RFIDReadConfig = {
    reader_type: 'fixed_gate',
    total_tags: tags.length,
    read_rate_per_second: 280,
    duplicate_ratio: 10,
    miss_rate: 1.5,
    noise_tags: 2,
  };

  const seen = new Set<string>();
  let bursts = 0;
  let totalEvents = 0;

  for await (const burst of engine.simulateGateRead(tags, gateCfg)) {
    bursts += 1;
    totalEvents += burst.length;
    burst.forEach((event) => {
      if (!event.is_noise) seen.add(event.epc);
    });
  }

  console.log('Gate read smoke test');
  console.log(`  bursts=${bursts}`);
  console.log(`  events=${totalEvents}`);
  console.log(`  unique_non_noise=${seen.size}/${tags.length}`);

  const hhCfg: RFIDReadConfig = {
    reader_type: 'handheld',
    total_tags: tags.length,
    read_rate_per_second: 55,
    duplicate_ratio: 6,
    miss_rate: 2.5,
    noise_tags: 1,
  };

  const hhSeen = new Set<string>();
  let hhEvents = 0;
  for await (const burst of engine.simulateHandheldRead(tags, hhCfg, 3)) {
    hhEvents += burst.length;
    burst.forEach((event) => {
      if (!event.is_noise) hhSeen.add(event.epc);
    });
  }

  console.log('Handheld read smoke test');
  console.log(`  events=${hhEvents}`);
  console.log(`  unique_non_noise=${hhSeen.size}/${tags.length}`);
}

async function runLiveScenarios() {
  const orgId = parseArg('org', '');
  if (!orgId) {
    console.log('Skipping live scenario run: pass --org=<uuid> to enable');
    return;
  }

  const scenario = parseArg('scenario', 'morning');
  const hooks = {
    speed: 'fast' as const,
    onLog: (entry: { icon: string; message: string }) => {
      console.log(`${entry.icon} ${entry.message}`);
    },
  };

  if (scenario === 'morning') {
    const result = await scenarioMorningDispatch({ org_id: orgId, hooks });
    console.log('Morning result', result);
    return;
  }

  if (scenario === 'return') {
    const result = await scenarioClientReturn({ org_id: orgId, hooks });
    console.log('Return result', result);
    return;
  }

  if (scenario === 'production') {
    const result = await scenarioProductionCycle({ org_id: orgId, hooks });
    console.log('Production result', result);
    return;
  }

  if (scenario === 'fullday') {
    const result = await scenarioFullDay({ org_id: orgId, scale: 'small', hooks });
    console.log('Full day result', result);
    return;
  }

  if (scenario === 'stress') {
    const result = await scenarioStressTest({ org_id: orgId, items_count: 1000, concurrent_gates: 2, hooks });
    console.log('Stress result', result);
    return;
  }

  console.log(`Unknown scenario '${scenario}'.`);
}

async function main() {
  console.log('Running simulator smoke tests...');
  await smokeRFIDEngine();

  if (process.argv.includes('--live')) {
    console.log('Running live scenario...');
    await runLiveScenarios();
  } else {
    console.log('Live scenario skipped. Add --live --org=<uuid> to run against API/DB.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
