const { kv } = require('@vercel/kv');
const fetch = require('node-fetch');

const REPO_OWNER = 'bowowiwendi';
const REPO_NAME = 'ipvps';
const FILE_PATH = 'main/ip';
const TOKEN = process.env.TOKEN;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path } = req;
  const method = req.method;

  // Read file from GitHub or KV
  if (path === '/api/read-file' && method === 'GET') {
    try {
      let rows = [];
      const kvData = await kv.get('ip_entries');
      if (kvData) {
        rows = kvData.map(entry => `### ${entry.name} ${entry.expiration} ${entry.ip}`);
      } else {
        const { content } = await readGitHubFile();
        rows = content.split('\n').filter(line => line.startsWith('###'));
        const kvEntries = rows.map(row => {
          const [, name, expiration, ip] = row.split(' ');
          return { name, expiration, ip };
        });
        await kv.set('ip_entries', kvEntries);
      }
      await checkExpiredEntries(rows);
      res.json({ success: true, rows });
    } catch (error) {
      res.status(500).json({ success: false, message: `Failed to load data: ${error.message}` });
    }
    return;
  }

  // Save Telegram token to KV
  if (path === '/api/save-telegram-token' && method === 'POST') {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Token is required.' });
    }
    await kv.set('telegram-token', token);
    res.json({ message: 'Token saved successfully.' });
    return;
  }

  // Set Telegram webhook
  if (path === '/api/set-webhook' && method === 'POST') {
    const token = await kv.get('telegram-token');
    if (!token) {
      return res.status(400).json({ message: 'Telegram token not configured.' });
    }
    const webhookUrl = `https://${req.headers.host}/api/telegram-webhook`;
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`);
    const result = await response.json();
    if (result.ok) {
      res.json({ message: 'Webhook set successfully.' });
    } else {
      res.status(500).json({ message: `Failed to set webhook: ${result.description}` });
    }
    return;
  }

  // Handle Telegram webhook
  if (path === '/api/telegram-webhook' && method === 'POST') {
    res.json({ message: 'Webhook received.' });
    return;
  }

  // Sync KV with GitHub
  if (path === '/api/sync-data' && method === 'POST') {
    try {
      const { content } = await readGitHubFile();
      const rows = content.split('\n').filter(line => line.startsWith('###')).map(row => {
        const [, name, expiration, ip] = row.split(' ');
        return { name, expiration, ip };
      });
      await kv.set('ip_entries', rows);
      await sendTelegramNotification('Data synchronized with GitHub repository.');
      res.json({ success: true, message: 'Synchronization successful.' });
    } catch (error) {
      res.status(500).json({ success: false, message: `Sync failed: ${error.message}` });
    }
    return;
  }

  // Add entry
  if (path === '/api/add-entry' && method === 'POST') {
    const { name, expiration, ip } = req.body;
    if (!name || !expiration || !ip) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    try {
      const { content, sha } = await readGitHubFile();
      const newRow = `### ${name} ${expiration} ${ip}`;
      const updatedContent = content ? `${content}\n${newRow}` : newRow;
      await updateGitHubFile(updatedContent, sha, `Add entry for ${name}`);
      let kvEntries = await kv.get('ip_entries') || [];
      kvEntries.push({ name, expiration, ip });
      await kv.set('ip_entries', kvEntries);
      await sendTelegramNotification(`New entry added: ${name}, ${expiration}, ${ip}`);
      res.json({ success: true, message: 'Entry added successfully.' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
    return;
  }

  // Edit entry
  if (path === '/api/edit-entry' && method === 'POST') {
    const { index, name, expiration, ip } = req.body;
    try {
      const { content, sha } = await readGitHubFile();
      let rows = content.split('\n').filter(line => line.startsWith('###'));
      if (index >= rows.length) {
        return res.status(400).json({ message: 'Invalid index.' });
      }
      rows[index] = `### ${name} ${expiration} ${ip}`;
      const updatedContent = rows.join('\n');
      await updateGitHubFile(updatedContent, sha, `Edit entry at index ${index}`);
      let kvEntries = await kv.get('ip_entries') || [];
      kvEntries[index] = { name, expiration, ip };
      await kv.set('ip_entries', kvEntries);
      await sendTelegramNotification(`Entry updated: ${name}, ${expiration}, ${ip}`);
      res.json({ success: true, message: 'Entry updated successfully.' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
    return;
  }

  // Delete entry
  if (path === '/api/delete-entry' && method === 'POST') {
    const { index } = req.body;
    try {
      const { content, sha } = await readGitHubFile();
      let rows = content.split('\n').filter(line => line.startsWith('###'));
      if (index >= rows.length) {
        return res.status(400).json({ message: 'Invalid index.' });
      }
      const deletedEntry = rows[index].split(' ').slice(1).join(', ');
      rows.splice(index, 1);
      const updatedContent = rows.join('\n');
      await updateGitHubFile(updatedContent, sha, `Delete entry at index ${index}`);
      let kvEntries = await kv.get('ip_entries') || [];
      kvEntries.splice(index, 1);
      await kv.set('ip_entries', kvEntries);
      await sendTelegramNotification(`Entry deleted: ${deletedEntry}`);
      res.json({ success: true, message: 'Entry deleted successfully.' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
    return;
  }

  res.status(404).json({ message: 'Not found' });
};

async function readGitHubFile() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`GitHub API error: ${errorData.message} (Status: ${response.status})`);
  }
  const data = await response.json();
  const content = atob(data.content.replace(/\n/g, ''));
  return { content: content || '', sha: data.sha };
}

async function updateGitHubFile(content, sha, commitMessage) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: commitMessage,
      content: btoa(content),
      sha
    })
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`GitHub API error: ${errorData.message} (Status: ${response.status})`);
  }
}

async function sendTelegramNotification(message) {
  const token = await kv.get('telegram-token');
  if (!token) return;
  const chatId = '5162695441';
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message })
  });
}

async function checkExpiredEntries(rows) {
  const today = new Date().toISOString().split('T')[0];
  for (const row of rows) {
    const parts = row.split(' ');
    if (parts.length < 4) continue;
    const [, name, expiration, ip] = parts;
    if (expiration < today) {
      await sendTelegramNotification(`Expired entry detected: ${name}, ${expiration}, ${ip}`);
    }
  }
}
