import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('ERROR: exporta SUPABASE_URL y SUPABASE_SERVICE_ROLE antes de correr.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

async function main() {
  const filePath = path.resolve(process.cwd(), 'db.json');
  const raw = JSON.parse(await readFile(filePath, 'utf8'));

  const rows = [];

  if (Array.isArray(raw)) {
    for (const o of raw) {
      rows.push({
        collection: 'default',
        external_id: o?.id?.toString?.() ?? null,
        data: o,
      });
    }
  } else if (raw && typeof raw === 'object') {
    for (const [collection, arr] of Object.entries(raw)) {
      if (!Array.isArray(arr)) continue;
      for (const o of arr) {
        rows.push({
          collection,
          external_id: o?.id?.toString?.() ?? null,
          data: o,
        });
      }
    }
  } else {
    console.error('Formato de db.json no reconocido. Debe ser array o { coleccion: [...] }');
    process.exit(1);
  }

  console.log(`Preparados ${rows.length} rows para upsert...`);
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('data_store')
      .upsert(batch, { onConflict: 'collection,external_id' });
    if (error) {
      console.error('Error en upsert:', error);
      process.exit(1);
    }
    console.log(`Upsert: ${i} -> ${i + batch.length}`);
  }

  console.log('Seed completado.');
}

main().catch(err => { console.error(err); process.exit(1); });
