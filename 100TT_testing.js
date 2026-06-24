import fs from "fs";
import fetch from "node-fetch";
import { Client, GatewayIntentBits } from "discord.js";
require('dotenv').config();


const TOKEN = process.env.DISCORD_TOKEN; // token privé
// const CHANNEL_ID1 = "1419834404192129145"; // Serv JG
const CHANNEL_ID2 = "1420794943806509088"; // Serv pv

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Charger les jeux
const GAMES = JSON.parse(fs.readFileSync("gameids.json", "utf-8"));

// Charger les anciens scores
function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync("data_testing.json", "utf-8"));
    const scoresArray = Array.isArray(data.scores) 
      ? data.scores 
      : Array.isArray(data.scores?.scores) 
        ? data.scores.scores 
        : [];
    return {
      lastUpdate: data.lastUpdate || null,
      scores: scoresArray
    };
  } catch {
    return { lastUpdate: null, scores: [] };
  }
}

// Sauvegarder les scores
function saveData(scores) {
  const data = {
    lastUpdate: new Date().toLocaleString(),
    scores
  };
  fs.writeFileSync("data_testing.json", JSON.stringify(data, null, 2));
}

// Sauvegarder les scores
function saveOldData(scores) {
  const data = {
    lastUpdate: new Date().toLocaleString(),
    scores
  };
  fs.writeFileSync("oldData_testing.json", JSON.stringify(data, null, 2));
}

// GÃ©nÃ©rer l'URL de la page stats TT du jeu
function getTTUrl(gameId) {
  return `https://www.jeux-geographiques.com/jeux-en-ligne-Statistiques-_pageid258_game_special_id=${gameId}.html`;
}

// GÃ©nÃ©rer l'URL du classement
function getGameUrl(gameId) {
  return `https://www.jeux-geographiques.com/cache/best_scores_ever_${gameId}.html`;
}

// GÃ©nÃ©rer l'URL du profil
function getProfileURL(profileId) {
  return `https://www.jeux-geographiques.com/_pageid226_upid=${profileId}.html`;
}

// DÃ©couper un message >2000 caractÃ¨res
function splitMessage(text, maxLength = 2000) {
  const lines = text.split('\n');
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    if ((currentChunk + line + '\n').length > maxLength) {
      chunks.push(currentChunk);
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// RÃ©cupÃ©rer le top 100 dâ€™un jeu
async function recupTT100(gameId) {
  const url = getGameUrl(gameId);
  let html;
  try {
    const res = await fetch(url);
    html = await res.text();
  } catch (e) {
    console.log(`âš ï¸ Impossible de charger ${gameId}`);
    return [];
  }

  // Extraction simple du tableau
  const balise = "<tbody>";
  // console.log("INDEX TBODY: " + html.indexOf(balise));
  const cut = html.substring(html.indexOf(balise));
  const lignes = cut.split("<tr class=");
  const TT100 = [];

  for (let i = 1; i < lignes.length; i++) {
    const ligne = lignes[i];
    if (!ligne) continue;

    const classementMatch = ligne.split("<td class='rank'>");
    const classement = classementMatch[1].split("</td>")[0].trim();

    const pseudoMatch = ligne.split("class='login_link'>");
    const pseudo = pseudoMatch[1].split("</a>")[0].trim();

    const pseudoIDMatch = ligne.split("<a href='-_pageid226_upid=");
    const pseudoID = pseudoIDMatch[1].split(".html")[0].trim();

    const dateMatch = ligne.split("<a title='");
    const date = dateMatch[1].split("'")[0].trim();

    const scoreMatch = ligne.split("<nobr>");
    const score = scoreMatch[1].split("</nobr>")[0].replace(/\s/g, "").trim();

    TT100.push({ gameId, classement, pseudo, pseudoID, score, date });
  }

  console.log(`Jeu ${gameId} â†’ ${TT100.length} entrÃ©es`);
  return TT100;
}

// Comparer anciens et nouveaux scores
function getDiffs(oldData, newData) {
  const diffs = [];
  const dateSeuil = new Date("2025-10-03T00:00:00"); // date limite

  for (const row of newData) {
    const rowDate = new Date(row.date.replace(" ", "T"));
    if (rowDate < dateSeuil) {
      continue; // ignore si antÃ©rieure Ã  la date seuil
    }
    // Est-ce que cette ligne exacte existait dÃ©jÃ  ?
    const existed = oldData.scores.some(r =>
      r.gameId === row.gameId &&
      r.pseudo === row.pseudo &&
      r.score === row.score &&
      r.date === row.date &&
      r.date 
    );

    if (!existed) {
      diffs.push(row);
    }
  }

  return diffs;
}

// RÃ©cupÃ¨re le nombre de tops 100TT dâ€™un joueur, ainsi que le nombre depuis septembre 2025
function getPlayerStats(pseudo, newData) {
  const septStart = new Date("2025-09-01T00:00:00");
  let apparitions = 0;
  let depuisSeptembre = 0;

  for (const row of newData) {
    // console.log(row.pseudo.toLowerCase().trim() + " -> " + pseudo.toLowerCase().trim(), row.pseudo.toLowerCase().trim() === pseudo.toLowerCase().trim());
    if (row.pseudo.toLowerCase().trim() !== pseudo.toLowerCase().trim()) {continue;}

    apparitions++;

    const d = new Date(row.date.replace(" ", "T"));
    if (d >= septStart) {
      depuisSeptembre++;
    }
  }

  return {
    nb100TT: apparitions,
    depuisSeptembre
  };
}


// Fonction principale
async function checkUpdates() {
  const oldData = loadData();
  let newData = [];

  for (const gameId of Object.keys(GAMES)) {
    const rows = await recupTT100(gameId);
    console.log(`âœ… RÃ©cupÃ©ration terminÃ©e pour ${gameId}`);
    newData = newData.concat(rows);
  }

  const diffs = getDiffs(oldData, newData);

  if (diffs.length > 0) {
    // const channel1 = await client.channels.fetch(CHANNEL_ID1);
    const channel2 = await client.channels.fetch(CHANNEL_ID2);
    let msg = "## :earth_africa: **Nouveaux tops 100TT depuis la derniÃ¨re exÃ©cution**\n";
    if (oldData.lastUpdate) {
      msg += `-# :clock1: Mise Ã  jour aprÃ¨s : ${oldData.lastUpdate}\n\n`;
    }


    for (const { gameId, classement, pseudo, pseudoID, score, date } of diffs) {
      console.log(`Nouveau top 100TT : ${gameId} - #${classement} - ${pseudo} (${score}) - ${date}`);
      const gameName = GAMES[gameId] || gameId;
      const url = getTTUrl(gameId);
      const profileUrl = getProfileURL(pseudoID);
      const totalGames = Object.keys(GAMES).length;
      const { nb100TT, depuisSeptembre } = getPlayerStats(pseudo, newData);

      if(classement === "1") {
        msg += `> :trophy: **[${gameName}](${url}) - #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - [${nb100TT}/${totalGames}] (${depuisSeptembre})**\n`;
      } 
      else if(classement === "2" && classement > 1) {
        msg += `> :second_place: **[${gameName}](${url}) - #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - [${nb100TT}/${totalGames}] (${depuisSeptembre})**\n`;
      }
      else if(classement === "3" && classement > 1) {
        msg += `> :third_place: **[${gameName}](${url}) - #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - [${nb100TT}/${totalGames}] (${depuisSeptembre})**\n`;
      }
      else if(classement <= 10 && classement > 1) {
        msg += `> :medal: **[${gameName}](${url}) - #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - [${nb100TT}/${totalGames}] (${depuisSeptembre})**\n`;
      }
      else{
        msg += `> [${gameName}](${url}) #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - [${nb100TT}/${totalGames}] (${depuisSeptembre})\n`;
      }
    }

    if(msg.length < 30000) // Ã©vite les messages trop longs
    {
      const parts = splitMessage(msg, 2000);
      for (const part of parts) {
        //const sent1 = await channel1.send(part);
        //setTimeout(async () => {
        //  try {
        //    await sent1.suppressEmbeds(true);
        //  } catch (err) {
        //    console.error("Erreur suppression embed (channel1) :", err);
        //  }
        //}, 500); // attendre 500 ms (0.5 seconde)

        const sent2 = await channel2.send(part);
        setTimeout(async () => {
          try {
            await sent2.suppressEmbeds(true);
          } catch (err) {
            console.error("Erreur suppression embed (channel2) :", err);
          }
        }, 500);
      }
      saveData(newData);
    } else {
      console.log("MESSAGE TROP LONG")
      // await channel1.send('ERROR : Message trop long Ã  envoyer (>10 000 caractÃ¨res)\n\nARRET AUTOMATIQUE :zzz:');
      await channel2.send('ERROR : Message trop long Ã  envoyer (>10 000 caractÃ¨res)\n\nARRET AUTOMATIQUE :zzz:');
      saveOldData(oldData.scores);

      // ArrÃªt du bot en cas d'erreur
      console.log("BOT STOPPED");
      client.destroy();
      process.exit(1);
    }
    console.log(`ðŸ“¢ Finito l'import`);
    
  } else {
    console.log("Aucun nouveau score depuis la derniÃ¨re exÃ©cution.");
  }
}

// Connexion Discord et exécution toutes les heures
client.once("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  checkUpdates(); // Exécution immédiate
  setInterval(checkUpdates, 60 * 5 * 1000); // Puis toutes les 30 minutes
});

client.login(TOKEN);