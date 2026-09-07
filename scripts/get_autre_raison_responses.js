#!/usr/bin/env node

/**
 * Script pour récupérer les réponses "Autre raison" du sondage
 * "Qu'est-ce qui vous retient de créer votre compte GoëloRides ?"
 * 
 * PRÉREQUIS :
 * - Le sondage doit être converti en type 'multi' (voir migration 20260907120000)
 * - Vous devez être authentifié en tant qu'admin
 * 
 * USAGE :
 *   node scripts/get_autre_raison_responses.js
 */

const SUPABASE_URL = 'https://iqxyiwnjwcepfgngkzsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxeHlpd25qd2NlcGZnbmdrenNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY5ODcsImV4cCI6MjA5NTgxMjk4N30._vanK7hFTdH-8o2l-BaVHP9m7mJv7oUFVyGrDwYCnbA';

async function getAutreRaisonResponses(accessToken) {
  try {
    console.log('🔍 Récupération des réponses "Autre raison"...\n');
    
    // Étape 1 : Récupérer le poll_id
    console.log('Étape 1 : Recherche du sondage...');
    const pollResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/poll_admin_list`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!pollResponse.ok) {
      throw new Error(`Erreur API: ${pollResponse.status} ${pollResponse.statusText}`);
    }
    
    const pollData = await pollResponse.json();
    
    if (pollData.ok === false) {
      throw new Error(`Accès refusé. Assurez-vous d'être authentifié en tant qu'admin.`);
    }
    
    const poll = pollData.polls?.find(p => p.slug === 'freins-creation-compte-v1');
    
    if (!poll) {
      console.log('❌ Sondage "freins-creation-compte-v1" introuvable');
      console.log('Sondages disponibles:');
      pollData.polls?.forEach(p => console.log(`  - ${p.slug}: "${p.question}"`));
      return;
    }
    
    console.log(`✓ Sondage trouvé: "${poll.question}"`);
    console.log(`  Type: ${poll.poll_type || 'single'}`);
    console.log(`  Total votes: ${poll.votes_count || 0}\n`);
    
    // Vérifier le type
    const pollType = poll.poll_type || 'single';
    
    if (pollType === 'single') {
      console.log('⚠️  ATTENTION : Le sondage est encore de type "single"');
      console.log('   Il ne peut pas stocker de texte libre.');
      console.log('   Appliquez d\'abord la migration 20260907120000_convert_poll_freins_to_multi.sql\n');
      
      // Afficher quand même les votes "Autre raison"
      const autreOption = poll.options?.find(o => o.level_key === 'other');
      if (autreOption) {
        console.log(`Option "Autre raison": ${autreOption.votes || 0} vote(s)`);
        console.log(`Mais aucun texte libre n'est stocké.\n`);
      }
      return;
    }
    
    // Étape 2 : Récupérer les résultats détaillés (avec free_texts)
    console.log('Étape 2 : Récupération des réponses textuelles...');
    const resultsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/poll_multi_admin_results`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_poll_id: poll.id })
      }
    );
    
    if (!resultsResponse.ok) {
      throw new Error(`Erreur API: ${resultsResponse.status} ${resultsResponse.statusText}`);
    }
    
    const results = await resultsResponse.json();
    
    if (results.ok === false) {
      throw new Error(results.error || 'Erreur inconnue');
    }
    
    console.log(`✓ ${results.responses_count || 0} réponse(s) totale(s)\n`);
    
    // Afficher les statistiques par option
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 STATISTIQUES PAR OPTION');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    const autreOption = results.options?.find(o => o.level_key === 'other');
    
    results.options?.forEach(option => {
      const isAutre = option.level_key === 'other';
      console.log(`${isAutre ? '👉 ' : '   '}${option.label}`);
      console.log(`   Votes: ${option.votes || 0} (${option.percent || 0}%)`);
      if (isAutre) {
        console.log(`   ⭐ C'est l'option "Autre raison"`);
      }
      console.log('');
    });
    
    // Afficher tous les textes libres
    const freeTexts = results.free_texts || [];
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 TEXTES LIBRES (toutes options confondues)');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    if (freeTexts.length === 0) {
      console.log('❌ Aucune réponse textuelle enregistrée pour le moment.\n');
      console.log('Raisons possibles:');
      console.log('  - Le sondage vient d\'être converti en "multi"');
      console.log('  - Le formulaire frontend n\'a pas encore été adapté');
      console.log('  - Aucun utilisateur n\'a encore saisi de texte\n');
    } else {
      freeTexts.forEach((entry, index) => {
        const date = new Date(entry.created_at).toLocaleString('fr-FR');
        console.log(`${index + 1}. [${date}]`);
        console.log(`   "${entry.text}"\n`);
      });
    }
    
    // Note importante
    console.log('═══════════════════════════════════════════════════════════');
    console.log('ℹ️  IMPORTANT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Les textes libres affichés ci-dessus peuvent être associés');
    console.log('à N\'IMPORTE QUELLE option cochée, pas seulement "Autre raison".');
    console.log('');
    console.log('Pour filtrer uniquement les réponses ayant coché "Autre raison",');
    console.log('il faudrait croiser poll_multi_responses avec');
    console.log('poll_multi_response_options et filtrer par option_id.\n');
    
    // Statistiques finales
    const autreVotes = autreOption?.votes || 0;
    const textsWithContent = freeTexts.filter(t => t.text.trim().length > 0).length;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📈 RÉSUMÉ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total réponses: ${results.responses_count || 0}`);
    console.log(`Votes "Autre raison": ${autreVotes} (${autreOption?.percent || 0}%)`);
    console.log(`Textes libres saisis: ${textsWithContent}`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    console.error('\n💡 Pour utiliser ce script, vous devez:');
    console.error('   1. Être authentifié en tant qu\'admin');
    console.error('   2. Fournir un token d\'accès valide');
    console.error('   3. Avoir appliqué la migration vers poll_type="multi"');
  }
}

// Point d'entrée
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Script de récupération des réponses "Autre raison"      ║
╚═══════════════════════════════════════════════════════════╝

USAGE:
  node scripts/get_autre_raison_responses.js <ACCESS_TOKEN>

PARAMÈTRES:
  ACCESS_TOKEN  Token JWT d'un utilisateur admin GoëloRides

EXEMPLE:
  node scripts/get_autre_raison_responses.js eyJhbG...

PRÉREQUIS:
  1. Avoir un compte admin GoëloRides
  2. Le sondage doit être converti en type 'multi'
     (appliquer migration 20260907120000_convert_poll_freins_to_multi.sql)
  3. Le formulaire frontend doit être adapté pour accepter du texte libre

OBTENIR UN TOKEN:
  1. Se connecter à l'admin GoëloRides
  2. Ouvrir la console développeur (F12)
  3. Exécuter: localStorage.getItem('sb-iqxyiwnjwcepfgngkzsm-auth-token')
  4. Ou utiliser: (await supabase.auth.getSession()).data.session.access_token
`);
  process.exit(0);
}

const accessToken = args[0];
getAutreRaisonResponses(accessToken);
