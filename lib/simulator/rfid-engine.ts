export interface RFIDReadConfig {
  reader_type: 'fixed_gate' | 'handheld';
  total_tags: number;
  read_rate_per_second: number;
  duplicate_ratio: number;
  miss_rate: number;
  noise_tags: number;
  /** Milliseconds between batches. Set to 0 for instant (max throughput) mode. Default: 100 */
  interval_ms?: number;
}

export interface RFIDReadEvent {
  epc: string;
  rssi: number;
  antenna: number;
  read_count: number;
  timestamp: number;
  is_noise?: boolean;
  found_on_retry?: boolean;
}

const DEFAULT_GATE_RATE = 260;
const DEFAULT_HANDHELD_RATE = 55;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomRSSI(min: number, max: number): number {
  return Number(randomFloat(min, max).toFixed(1));
}

function randomAntenna(min: number, max: number): number {
  return randomInt(min, max);
}

function generateNoiseEPC(seed = Date.now()): string {
  const n = Math.abs((seed * 9301 + 49297) % 233280);
  return `NOISE-${n.toString(16).toUpperCase().padStart(8, '0')}`;
}

function normalizeConfig(config: RFIDReadConfig): RFIDReadConfig {
  const readerRate = config.reader_type === 'fixed_gate' ? DEFAULT_GATE_RATE : DEFAULT_HANDHELD_RATE;
  return {
    ...config,
    total_tags: Math.max(0, config.total_tags),
    read_rate_per_second: clamp(config.read_rate_per_second || readerRate, 1, 10000),
    duplicate_ratio: clamp(config.duplicate_ratio || 10, 0, 30),
    miss_rate: clamp(config.miss_rate || 0.8, 0, 100),
    noise_tags: clamp(config.noise_tags || 0, 0, 100),
  };
}

export class RFIDEngine {
  async *simulateGateRead(
    tags: string[],
    config: RFIDReadConfig
  ): AsyncGenerator<RFIDReadEvent[]> {
    if (!tags.length) return;

    const cfg = normalizeConfig({ ...config, reader_type: 'fixed_gate', total_tags: tags.length });
    const shuffled = shuffle(tags.filter(Boolean));

    const shouldMiss = new Set<string>();
    const missCount = Math.floor((cfg.miss_rate / 100) * shuffled.length);
    for (const tag of shuffle(shuffled).slice(0, missCount)) {
      shouldMiss.add(tag);
    }

    const initialTags = shuffled.filter((tag) => !shouldMiss.has(tag));
    const emittedTags = new Set<string>();
    const inField: string[] = [];

    const totalTimeMs = Math.max(500, (shuffled.length / Math.max(1, cfg.read_rate_per_second)) * 1000);
    const intervalMs = cfg.interval_ms ?? 100;
    // For instant mode (interval_ms=0) use ~100 tags per batch; otherwise derive from time
    const batchesCount = intervalMs === 0
      ? Math.max(2, Math.ceil(shuffled.length / 100))
      : Math.max(4, Math.ceil(totalTimeMs / intervalMs));
    let newIdx = 0;

    for (let i = 0; i < batchesCount; i += 1) {
      const events: RFIDReadEvent[] = [];
      const remainingBatches = Math.max(1, batchesCount - i);
      const remainingTags = initialTags.length - newIdx;

      const burstFactor = 1.35 - i / batchesCount;
      const targetNew = Math.max(0, Math.ceil((remainingTags / remainingBatches) * burstFactor));

      for (let n = 0; n < targetNew; n += 1) {
        if (newIdx >= initialTags.length) break;
        const epc = initialTags[newIdx];
        newIdx += 1;
        emittedTags.add(epc);
        inField.push(epc);

        events.push({
          epc,
          rssi: randomRSSI(-70, -40),
          antenna: randomAntenna(1, 4),
          read_count: 1,
          timestamp: Date.now(),
        });
      }

      const dupTarget = Math.floor(events.length * cfg.duplicate_ratio * 0.3);
      const duplicatePool = inField.length ? inField : [...emittedTags];
      for (let d = 0; d < dupTarget; d += 1) {
        if (!duplicatePool.length) break;
        const epc = duplicatePool[randomInt(0, duplicatePool.length - 1)];
        events.push({
          epc,
          rssi: randomRSSI(-74, -43),
          antenna: randomAntenna(1, 4),
          read_count: randomInt(2, 12),
          timestamp: Date.now(),
        });
      }

      if (cfg.noise_tags > 0 && Math.random() < 0.05) {
        const count = randomInt(1, Math.min(2, cfg.noise_tags));
        for (let x = 0; x < count; x += 1) {
          events.push({
            epc: generateNoiseEPC(Date.now() + x),
            rssi: randomRSSI(-85, -65),
            antenna: randomAntenna(1, 4),
            read_count: 1,
            timestamp: Date.now(),
            is_noise: true,
          });
        }
      }

      if (events.length) {
        yield shuffle(events);
      }
      if (intervalMs > 0) await sleep(intervalMs);
    }

    if (shouldMiss.size > 0) {
      const retryEvents: RFIDReadEvent[] = [...shouldMiss].map((epc) => ({
        epc,
        rssi: randomRSSI(-80, -58),
        antenna: randomAntenna(1, 4),
        read_count: 1,
        timestamp: Date.now(),
        found_on_retry: true,
      }));
      yield retryEvents;
    }
  }

  async *simulateHandheldRead(
    tags: string[],
    config: RFIDReadConfig,
    walks = 3
  ): AsyncGenerator<RFIDReadEvent[]> {
    if (!tags.length) return;

    const cfg = normalizeConfig({ ...config, reader_type: 'handheld', total_tags: tags.length });
    const shuffled = shuffle(tags.filter(Boolean));

    const discoveryRates = [0.65, 0.25, 0.1];
    const discovered = new Set<string>();

    for (let walk = 0; walk < walks; walk += 1) {
      const rate = discoveryRates[walk] ?? 0.05;
      const targetDiscoveries = Math.floor(shuffled.length * rate);

      const walkDurationMs = Math.max(600, Math.ceil((targetDiscoveries / Math.max(1, cfg.read_rate_per_second)) * 1000 * 3));
      const emitInterval = cfg.interval_ms ?? 200;
      const batches = emitInterval === 0
        ? Math.max(1, Math.ceil(targetDiscoveries / 30))
        : Math.max(1, Math.ceil(walkDurationMs / emitInterval));
      const tagsPerBatch = Math.max(1, Math.ceil(targetDiscoveries / batches));

      for (let i = 0; i < batches; i += 1) {
        const events: RFIDReadEvent[] = [];

        for (let j = 0; j < tagsPerBatch; j += 1) {
          const candidate = shuffled.find((epc) => !discovered.has(epc));
          if (!candidate) break;

          if (Math.random() * 100 < cfg.miss_rate && walk < walks - 1) {
            continue;
          }

          discovered.add(candidate);
          events.push({
            epc: candidate,
            rssi: randomRSSI(-65, -45),
            antenna: 1,
            read_count: 1,
            timestamp: Date.now(),
          });
        }

        const nearby = [...discovered].slice(-12);
        for (const epc of nearby) {
          if (Math.random() < 0.55) {
            events.push({
              epc,
              rssi: randomRSSI(-68, -46),
              antenna: 1,
              read_count: randomInt(1, 5),
              timestamp: Date.now(),
            });
          }
        }

        if (cfg.noise_tags > 0 && Math.random() < 0.03) {
          events.push({
            epc: generateNoiseEPC(Date.now()),
            rssi: randomRSSI(-84, -67),
            antenna: 1,
            read_count: 1,
            timestamp: Date.now(),
            is_noise: true,
          });
        }

        if (events.length > 0) {
          yield shuffle(events);
        }
        if (emitInterval > 0) await sleep(emitInterval);
      }

      if (walk < walks - 1 && emitInterval > 0) {
        await sleep(Math.max(0, emitInterval * 2));
      }
    }

    const missed = shuffled.filter((epc) => !discovered.has(epc));
    if (missed.length > 0) {
      yield missed.map((epc) => ({
        epc,
        rssi: randomRSSI(-76, -60),
        antenna: 1,
        read_count: 1,
        timestamp: Date.now(),
        found_on_retry: true,
      }));
    }
  }
}
