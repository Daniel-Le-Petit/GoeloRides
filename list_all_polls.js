#!/usr/bin/env node

const SUPABASE_URL = 'https://iqxyiwnjwcepfgngkzsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxeHlpd25qd2NlcGZnbmdrenNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY5ODcsImV4cCI6MjA5NTgxMjk4N30._vanK7hFTdH-8o2l-BaVHP9m7mJv7oUFVyGrDwYCnbA';

async function listAllPolls() {
  try {
    console.log('🔍 Listing all polls in the database...\n');
    
    const pollResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/polls?select=id,question,slug,poll_type,is_active,created_at`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!pollResponse.ok) {
      throw new Error(`Failed to fetch polls: ${pollResponse.statusText}`);
    }
    
    const polls = await pollResponse.json();
    
    console.log(`Found ${polls.length} poll(s):\n`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    for (const poll of polls) {
      console.log(`Poll ID: ${poll.id}`);
      console.log(`Question: "${poll.question}"`);
      console.log(`Slug: ${poll.slug || '(none)'}`);
      console.log(`Type: ${poll.poll_type || 'single'}`);
      console.log(`Active: ${poll.is_active ? 'Yes' : 'No'}`);
      console.log(`Created: ${new Date(poll.created_at).toLocaleString('fr-FR')}`);
      console.log('───────────────────────────────────────────────────────────\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

listAllPolls();
