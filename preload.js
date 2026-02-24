const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Status
  getStatus: () => fetch('http://localhost:18794/api/status').then(r => r.json()),
  
  // Connections
  getConnections: () => fetch('http://localhost:18794/api/connections').then(r => r.json()),
  
  // Skills marketplace
  getSkills: () => fetch('http://localhost:18794/api/skills').then(r => r.json()),
  
  // My published skills
  getMySkills: () => fetch('http://localhost:18794/api/skills/mine').then(r => r.json()),
  
  // Installed skills
  getInstalledSkills: () => fetch('http://localhost:18794/api/installed-skills').then(r => r.json()),
  
  // Check update
  checkUpdate: () => fetch('http://localhost:18794/api/check-update').then(r => r.json()),
  
  // Balance
  getBalance: () => fetch('http://localhost:18794/api/balance').then(r => r.json()),
  
  // Messaging
  sendMessage: (to, message) => fetch('http://localhost:18794/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, message })
  }).then(r => r.json()),
  
  // Appreciation
  sendAppreciation: (peerId) => fetch('http://localhost:18794/api/appreciate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peerId })
  }).then(r => r.json()),
  
  // Publish skill
  publishSkill: (skillPath, price, metadata) => fetch('http://localhost:18794/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillPath, price, metadata })
  }).then(r => r.json()),
  
  // Download skill
  downloadSkill: (skillId) => fetch('http://localhost:18794/api/skills/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillId })
  }).then(r => r.json()),
  
  // Rate skill
  rateSkill: (skillId, rating, review) => fetch('http://localhost:18794/api/skills/rate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillId, rating, review })
  }).then(r => r.json()),
  
  // Leaderboard
  getLeaderboard: () => fetch('http://localhost:18794/api/leaderboard').then(r => r.json()),
  
  onShowStatus: (callback) => ipcRenderer.on('show-status', callback)
});
