const puppeteer = require("puppeteer");
const {
	APIBASE,
	eventIdFromName,
	login,
	soGiveFailIfPointingAtProduction,
	fillInForm
} = require("../res/UtilityFunctions");
const {
	username,
	password
} = require("../../../logins/sogive-app/puppeteer.credentials");
const {
	CommonSelectors,
	SoGiveSelectors: { Event }
} = require("../utils/MasterSelectors");
const { createEvent, deleteEvent } = require("../res/UtilsSoGive");

// Default event data
const eventData = {
	name: Date.now(),
	description: "Resistance is futile",
	"web-page": "https://developers.google.com/web/tools/puppeteer/",
	"matched-funding": 10,
	sponsor: "Locutus of Borg",

	backdrop:
		"https://i.pinimg.com/originals/a4/42/b9/a442b9891265ec69c78187a030b0753b.jpg"
};

let browser;
let page;

describe("Create event tests", () => {
    const longName = "supercalifragilisticexpialidocious";
    let id = '';

    beforeAll(async () => {
        browser = await puppeteer.launch({headless: false});
        page = await browser.newPage();
    })

    afterAll(async () => {
        browser.close();
    })

    // Journey: User visits site, clicks on log in, types in their credentials, press Enter.
    // Result: They are now logged in
    test('Login to the site', async () => {
		await page.goto(APIBASE);
		await soGiveFailIfPointingAtProduction({ page });

        await page.$('.login-link');
        await page.click('.login-link');
        
        await page.click('[name=email]');
        await page.type('[name=email]', username);
        await page.click('[name=password]');
        await page.type('[name=password]', password);

        await page.keyboard.press('Enter');
    }, 99999)

    // Jorney: User goes to 'Event' tab. Clicks on create event, fills in some fields when prompted, publishes the changes.
    // Result: New event is published and listed
	test("Create an event", async () => {
        await page.goto(APIBASE+'#event');
		await soGiveFailIfPointingAtProduction({ page });

        // Clicks on the create button. 
        await page.waitForSelector('.glyphicon');
		await page.click('.glyphicon');

        // Wait for form to render, then fill it
		await page.waitForSelector("[name=name]");
		await page.click("[name=name]");
		await page.type("[name=name", longName);

        // Double check props are working correctly
		const nameText = await page.$eval("[name=name]", e => e.value);
		await expect(nameText).toBe(longName);

        await page.select('[name=country', 'GB');

        await page.click('[name=publish]');

        // Grab and save the id. We'll use it later to see if event has been created.
        const idString = await page.$eval('#editEvent small', e => {
            return e.innerHTML.split(': ')[1];
        })

        id = idString;

        // Reload to avoid any buggy behaviour
        await page.goto(APIBASE+`#event`);
        await page.waitFor(500);
        await page.reload();
	}, 45000);

    // Journey: User goes to specific event, clicks on 'Delete'
    // Result: Event deleted and removed from the list.
    test('Delete event created', async() => {
        // Go to the event
        // await page.goto(`http://local.sogive.org#event/${id}`);
        await page.goto(APIBASE+`#event/${id}`);
		await soGiveFailIfPointingAtProduction({ page });

        // Click on the 'Edit' link on the top right
        await page.waitForSelector('.pull-right');
        await page.click('.pull-right a');

        // Wait for 'Delete' button to render
        await page.waitForSelector('[name=delete]');
        await page.click('[name=delete]');

        // Wait and reload to be safe
        await page.waitFor(4000);
        await page.reload();
        await page.goto(APIBASE+`#event`);

        // Make sure event has been removed
        const nameIsPresent = await page.evaluate(() => {
            return document.querySelector('body').innerText.includes("supercalifragilisticexpialidocious");
        })
        await expect(nameIsPresent).toBe(false);
        await page.waitFor(500); 
    }, 45000);  
});


