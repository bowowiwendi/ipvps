const fetch = require('node-fetch');

const REPO_OWNER = 'bowowiwendi';
const REPO_NAME = 'ipvps';
const FILE_PATH = 'main/ip';
const TOKEN = process.env.TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function readGitHubFile() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });
  if (!response.ok) throw new Error('Failed to read file from GitHub.');
  const data = await response.json();
  return atob(data.content.replace(/\n/g, ''));
}

async function sendTelegramNotification(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message })
  });
}

async function checkExpiredEntries() {
  const content = await readGitHubFile();
  const rows = content.split('\n').filter(line => line.startsWith('###'));
  const today = new Date().toISOString().split('T')[0];
  for (const row of rows) {
    const [, name, expiration, ip] = row.split(' ');
    if (expiration < today) {
      await sendTelegramNotification(`Expired entry detected: ${name}, ${expiration}, ${ip}`);
    }
  }
}

checkExpiredEntries().catch(console.error);
