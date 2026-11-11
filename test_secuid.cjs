const { Downloader } = require('@tobyg74/tiktok-api-dl');

async function test() {
  const res = await Downloader('https://www.tiktok.com/@lengchorvin1/video/7699013035419012373', { version: 'v1' });
  console.log('Result author:', res.result?.author);
}

test().catch(console.error);
