import fs from "fs";
import fetch from "node-fetch";
import { Client, GatewayIntentBits } from "discord.js";
require('dotenv').config();



const TOKEN = process.env.DISCORD_TOKEN; // token privé
const CHANNEL_ID1 = "1420794943806509088"; // Serv pv
const CHANNEL_ID2 = "1419834404192129145"; // Serv JG

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Charger les jeux
const GAMES = JSON.parse(fs.readFileSync("gameids.json", "utf-8"));

// Charger les anciens scores
function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync("data.json", "utf-8"));
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
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// Sauvegarder les scores au cas où
function saveOldData(scores) {
  const data = {
    lastUpdate: new Date().toLocaleString(),
    scores
  };
  fs.writeFileSync("oldData.json", JSON.stringify(data, null, 2));
}

// Générer l'URL de la page stats TT du jeu
function getTTUrl(gameId) {
  return `https://www.jeux-geographiques.com/jeux-en-ligne-Statistiques-_pageid258_game_special_id=${gameId}.html`;
}

// Générer l'URL du classement
function getGameUrl(gameId) {
  return `https://www.jeux-geographiques.com/cache/best_scores_ever_${gameId}.html`;
}

// Générer l'URL du profil
function getProfileURL(profileId) {
  return `https://www.jeux-geographiques.com/_pageid226_upid=${profileId}.html`;
}

// Découper un message >2000 caractères
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

// Récupérer le top 100 d’un jeu
async function recupTT100(gameId) {
  const url = getGameUrl(gameId);
  let html;
  try {
    const res = await fetch(url);
    html = await res.text();
  } catch (e) {
    console.log(`❌ Impossible de charger ${gameId}`);
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

  console.log(`Jeu ${gameId} ➡️ ${TT100.length} entrées`);
  return TT100;
}

// Comparer anciens et nouveaux scores
function getDiffs(oldData, newData) {
  const diffs = [];
  // const dateSeuil = new Date("2025-10-03T00:00:00"); // date limite

  for (const row of newData) {
    const rowDate = new Date(row.date.replace(" ", "T"));
    //if (rowDate < dateSeuil) {
    //  continue; // ignore si antérieure à la date seuil
    //}
    // Est-ce que cette ligne exacte existait déjà ?
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

// Récupère le nombre de tops 100TT d’un joueur, ainsi que le nombre depuis septembre 2025
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
    console.log(`✅ Récupération terminée pour ${gameId}`);
    newData = newData.concat(rows);
  }

  const diffs = getDiffs(oldData, newData);

  if (diffs.length > 0) {
    const channel1 = await client.channels.fetch(CHANNEL_ID1);
    const channel2 = await client.channels.fetch(CHANNEL_ID2);
    let msg = "## :earth_africa: **Nouveaux tops 100TT depuis la dernière exécution**\n";
    if (oldData.lastUpdate) {
      msg += `-# :clock1: Mise à jour après : ${oldData.lastUpdate}\n\n`;
    }


    for (const { gameId, classement, pseudo, pseudoID, score, date } of diffs) {
      console.log(`Nouveau top 100TT : ${gameId} - #${classement} - ${pseudo} (${score}) - ${date}`);
      const gameName = GAMES[gameId] || gameId;
      const url = getTTUrl(gameId);
      const profileUrl = getProfileURL(pseudoID);
      const totalGames = Object.keys(GAMES).length;
      const { nb100TT, depuisSeptembre } = getPlayerStats(pseudo, newData);
      const dateSeuil = new Date("2026-02-12T23:59:51"); // date du jour

      if (new Date(date.replace(" ", "T")) >= dateSeuil) {
        if (nb100TT === totalGames) {
          if(classement === "1") {
            msg += `> :trophy: **[${gameName}](${url}) - #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - :goat: **[${nb100TT}/${totalGames}]** :goat: (${depuisSeptembre})**\n`;
          } 
          else if(classement === "2" && classement > 1) {
            msg += `> :second_place: **[${gameName}](${url}) - #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - :sparkles: **[${nb100TT}/${totalGames}]** :sparkles: (${depuisSeptembre})**\n`;
          }
          else if(classement === "3" && classement > 1) {
            msg += `> :third_place: **[${gameName}](${url}) - #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - :star2: **[${nb100TT}/${totalGames}]** :star2: (${depuisSeptembre})**\n`;
          }
          else if(classement <= 10 && classement > 1) {
            msg += `> :medal: **[${gameName}](${url}) - #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - :comet: **[${nb100TT}/${totalGames}]** :comet: (${depuisSeptembre})**\n`;
          }
          else{
            msg += `> [${gameName}](${url}) #${classement} - [${pseudo}](${profileUrl}) (${score}) - ${date} - :dizzy: **[${nb100TT}/${totalGames}]** :dizzy: (${depuisSeptembre})\n`;
          }
        } else {
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
      }
    }

    if(msg.length < 30000) // évite les messages trop longs
    {
      const parts = splitMessage(msg, 2000);
      for (const part of parts) {
        const sent1 = await channel1.send(part);
        await sent1.suppressEmbeds(true)
        setTimeout(async () => {
          try {
            await sent1.suppressEmbeds(true);
            
          } catch (err) {
            console.error("Erreur suppression embed (channel1) :", err);
          }
        }, 500); // attendre 500 ms (0.5 seconde)

        const sent2 = await channel2.send(part);
        await sent2.suppressEmbeds(true)
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
      await channel1.send('ERROR : Message trop long à envoyer (>30 000 caractères)\n\nARRET AUTOMATIQUE :zzz:');
      await channel2.send('ERROR : Message trop long à envoyer (>30 000 caractères)\n\nARRET AUTOMATIQUE :zzz:');
      saveOldData(oldData.scores);

      // Arrêt du bot en cas d'erreur
      console.log("BOT STOPPED");
      client.destroy();
      process.exit(1);
    }
    console.log(`✅ Finito l'import`);
  } else {
    console.log("Aucun nouveau score depuis la dernière exécution.");
  }
}

// Connexion Discord et exécution toutes les heures
client.once("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  checkUpdates(); // Exécution immédiate
  setInterval(checkUpdates, 60 * 5 * 1000); // Puis toutes les 30 minutes
});

client.login(TOKEN);