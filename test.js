require('dotenv').config();
const FixedFloat = require("./index");
describe('FF unit test', () => {
    const fixed = new FixedFloat(process.env.API_KEY, process.env.API_SECRET);

    it ('Get currency', async () => {
        const data = await fixed.getCurrencies();
        console.log(data);
    })
})
