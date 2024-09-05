import { connect } from 'puppeteer-real-browser';
import fs from 'fs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractAllTeamsUrl = async (page) => {
  await page.goto("https://www.basketball-reference.com/teams/", { waitUntil: "domcontentloaded" });
  const teams = await page.$$eval("#teams_active > tbody > tr > th > a", (activeTeams) => {
    const teamName = activeTeams.map((team) => team.textContent);
    const teamUrl = activeTeams.map((team) => team.href);
    return teamName.map((name, index) => ({ 
      name, 
      url: teamUrl[index],
      players: [],
    }));
  });

  await delay(3500);
  return teams;
};

const extractLatestSeasonUrl = async (page, url) => {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const seasonRow = await page.$eval("tbody > tr[data-row='0'] > th > a", (season) => {
      return season.href;
    });
    await delay(3500);
    return seasonRow;
  } catch (error) {
    console.error(error);
    throw new Error("Error extracting latest season");
  }
}

const extractPlayers = async (page, url) => {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const players = await page.$$eval("#roster > tbody > tr > td[data-stat='player'] > a", (rows) => {
      return rows.map((row) => {
        return {
          name: row.textContent,
          url: row.href,
        };
      });
    });
    await delay(3500);
    return players;
  } catch (error) {
    console.error(error);
    throw new Error("Error extracting players");
  }
}

const extractPlayerCareerStats = async (page, url) => {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const headers = await page.$$eval("#per_game > thead > tr > th", (headers) => {
      return headers.map((head) => head.textContent);
    });

    const careerStats = await page.$$eval("#per_game > tbody > tr", (careerStats, headers) => {
      return careerStats.map((stat) => {
        const yearlyStats = {};
        const text = stat.innerText;
        const statValues = text.split("\t");
        for (let i = 0; i < headers.length; i++) {
          yearlyStats[headers[i]] = statValues[i];
        }
        return yearlyStats;
      });
    }, headers);

    await delay(3500);
    return careerStats;
  } catch (error) {
    console.error(error);
    throw new Error("Error extracting player career stats");
  }
}

(async () => {
  const { page, browser } = await connect({
    headless: false,
    turnstile: true,
    connectOption: {
      defaultViewport: null,
    }
  });

  const teams = await extractAllTeamsUrl(page);
  for (const team of teams) {
    console.log("Extracting team: ", team.name);
    const latestSeasonUrl = await extractLatestSeasonUrl(page, team.url);
    const players = await extractPlayers(page, latestSeasonUrl);
    for (const player of players) {
      console.log("Extracting player: ", player.name);
      const careerStats = await extractPlayerCareerStats(page, player.url);
      player.careerStats = careerStats;
    }
    team.players = players;
    console.log("Finished extracting team: ", team.name);
    // create if output folder doesn't exist
    if (!fs.existsSync('./output')) {
      fs.mkdirSync('./output');
    }
    fs.writeFileSync(`./output/${team.name}.json`, JSON.stringify(team, null, 2));
  }

  await browser.close();
})();