#!/usr/bin/env node

/**
 * Script to query "Autre raison" responses from the GoëloRides poll
 */

const SUPABASE_URL = 'https://iqxyiwnjwcepfgngkzsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxeHlpd25qd2NlcGZnbmdrenNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY5ODcsImV4cCI6MjA5NTgxMjk4N30._vanK7hFTdH-8o2l-BaVHP9m7mJv7oUFVyGrDwYCnbA';

async function queryAutreRaison() {
  try {
    console.log('🔍 Querying GoëloRides survey data...\n');
    
    // Step 1: Find the poll with slug 'freins-creation-compte-v1'
    console.log('Step 1: Finding the survey poll...');
    const pollResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/polls?slug=eq.freins-creation-compte-v1&select=id,question,slug`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!pollResponse.ok) {
      throw new Error(`Failed to fetch poll: ${pollResponse.statusText}`);
    }
    
    const polls = await pollResponse.json();
    
    if (polls.length === 0) {
      console.log('❌ Poll not found with slug: freins-creation-compte-v1');
      return;
    }
    
    const poll = polls[0];
    console.log(`✓ Found poll: "${poll.question}"`);
    console.log(`  Poll ID: ${poll.id}\n`);
    
    // Step 2: Find the "Autre raison" option
    console.log('Step 2: Finding "Autre raison" option...');
    const optionsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/poll_options?poll_id=eq.${poll.id}&level_key=eq.other&select=id,label,level_key`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!optionsResponse.ok) {
      throw new Error(`Failed to fetch options: ${optionsResponse.statusText}`);
    }
    
    const options = await optionsResponse.json();
    
    if (options.length === 0) {
      console.log('❌ "Autre raison" option not found');
      return;
    }
    
    const autreOption = options[0];
    console.log(`✓ Found option: "${autreOption.label}"`);
    console.log(`  Option ID: ${autreOption.id}\n`);
    
    // Step 3: Count votes for "Autre raison"
    console.log('Step 3: Counting votes for "Autre raison"...');
    const votesResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/poll_votes?option_id=eq.${autreOption.id}&select=id,created_at,user_id,voter_key`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'count=exact'
        }
      }
    );
    
    if (!votesResponse.ok) {
      throw new Error(`Failed to fetch votes: ${votesResponse.statusText}`);
    }
    
    const votes = await votesResponse.json();
    const voteCount = votesResponse.headers.get('content-range')?.split('/')[1] || votes.length;
    
    console.log(`✓ Found ${voteCount} vote(s) for "Autre raison"\n`);
    
    // Display the results
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 RÉSULTATS');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log(`Sondage: "${poll.question}"`);
    console.log(`Option: "${autreOption.label}"`);
    console.log(`Nombre total de votes: ${voteCount}\n`);
    
    console.log('⚠️  IMPORTANT:');
    console.log('───────────────────────────────────────────────────────────');
    console.log('Le sondage "Qu\'est-ce qui vous retient de créer votre compte"');
    console.log('est un sondage à CHOIX UNIQUE (type: "single").');
    console.log('');
    console.log('La structure actuelle de la base de données ne stocke PAS');
    console.log('de texte libre pour l\'option "Autre raison".');
    console.log('');
    console.log('Les utilisateurs peuvent uniquement sélectionner cette option,');
    console.log('mais ne peuvent pas saisir de texte personnalisé expliquant');
    console.log('leur "autre raison".\n');
    
    console.log('📋 Liste des votes pour "Autre raison":');
    console.log('───────────────────────────────────────────────────────────');
    
    if (votes.length === 0) {
      console.log('Aucun vote enregistré pour cette option.');
    } else {
      votes.forEach((vote, index) => {
        console.log(`${index + 1}. Vote ID: ${vote.id}`);
        console.log(`   Date: ${new Date(vote.created_at).toLocaleString('fr-FR')}`);
        console.log(`   Type: ${vote.user_id ? 'Utilisateur connecté' : 'Anonyme (voter_key)'}`);
        console.log('');
      });
    }
    
    console.log('\n💡 SOLUTION:');
    console.log('───────────────────────────────────────────────────────────');
    console.log('Pour capturer des réponses textuelles personnalisées, il faut:');
    console.log('');
    console.log('1. Soit convertir ce sondage en type "multi" (multi-choix)');
    console.log('   et utiliser le champ free_text de poll_multi_responses');
    console.log('');
    console.log('2. Soit ajouter un champ free_text à la table poll_votes');
    console.log('   pour les sondages single-choice\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  }
}

queryAutreRaison();
