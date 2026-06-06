import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const seedSQL = readFileSync(join(__dirname, 'seed.sql'), 'utf-8');

console.log('🌱 Running seed script...');

const { data, error } = await supabase.rpc('exec_sql', { sql: seedSQL });

if (error) {
  // If exec_sql RPC doesn't exist, try using the REST API directly
  // Split by semicolons and execute each statement
  const statements = seedSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));
  
  console.log(`📝 Executing ${statements.length} statements...`);
  
  for (const stmt of statements) {
    if (!stmt) continue;
    
    // Parse INSERT statements to use Supabase client
    if (stmt.toLowerCase().includes('insert into programs')) {
      console.log('  → Seeding programs...');
      // Execute raw query via postgrest
      const { error: insertError } = await supabase.rpc('exec', { sql: stmt + ';' });
      if (insertError) {
        console.error('    ⚠️  Error:', insertError.message);
      }
    } else if (stmt.toLowerCase().includes('insert into regions')) {
      console.log('  → Seeding regions...');
    } else if (stmt.toLowerCase().includes('insert into provinces')) {
      console.log('  → Seeding provinces...');
    }
  }
  
  console.log('\n⚠️  Note: Direct SQL execution requires database admin access.');
  console.log('   Please run the seed.sql file manually via Supabase Dashboard > SQL Editor');
  console.log('   Or use: psql <connection-string> < supabase/seed/seed.sql\n');
} else {
  console.log('✅ Seed data applied successfully!');
}
