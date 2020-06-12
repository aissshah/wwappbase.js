// checks functionality of sogive.org/#edit
const puppeteer = require('puppeteer');
const { login, soGiveFailIfPointingAtProduction, donate } = require("../utils/UtilityFunctions");
const { username, password } = require("../utils/Credentials");
const { CommonSelectors, Search, General } = require('../utils/SoGiveSelectors');
const { targetServers } = require('../utils/testConfig');

const config = JSON.parse(process.env.__CONFIGURATION);

const baseSite = targetServers[config.site];
const protocol = config.site === 'local' ? 'http://' : 'https://';

let url = `${baseSite}`;

// the lucky charity to be tested
const lamb = "urras-eaglais-na-h-aoidhe";
const timeStamp = new Date().toISOString();

describe('Edit organisation tests', () => {

	test('Edit and publish field', async () => {
		await page.goto(url);

		await page.$('.login-link');
		await page.click('.login-link');
        
		await page.click('[name=email]');
		await page.type('[name=email]', username);
		await page.click('[name=password]');
		await page.type('[name=password]', password);

		// await page.evaluate(() => { debugger; });

		await page.keyboard.press('Enter');

		await page.goto(`${url}#edit?charityId=${lamb}`);

		await page.waitForSelector('[name=summaryDescription]');
		await page.click('[name=summaryDescription]', { clickCount: 3 });
		await page.type('[name=summaryDescription]', timeStamp);
		await page.click(CommonSelectors.Publish);
		await page.goto(`${url}#charity?charityId=urras-eaglais-na-h-aoidhe`);

		await page.waitForSelector('.description-short');

		const profileShortDescription = await page.$eval('.donation-output p', e => e.innerText);
		await expect(profileShortDescription).toBe(timeStamp);
	}, 99999);

});
