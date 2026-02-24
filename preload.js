const { contextBridge, ipcRenderer } = require('electron');

// Expose API that uses HTTP fetch to connect to backend
contextBridge.exposeInMainWorld('api', {
  // Status - use fetch to connect to backend
  getStatus: () => fetch('http://localhost:18794/api/status').then(r => r.json()),
  
  // Connections
  getConnections: () => fetch('http://localhost:18794/api/connections').then(r => r.json()),
  
  // Skills
  getSkills: () => fetch('http://localhost:18794/api/skills').then(r => r.json()),
  
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
  
  // Skills management
  publishSkill: (skillPath, price, metadata) => fetch('http://localhost:18794/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillPath, price, metadata })
  }).then(r => r.json()),
  
  rateSkill: (skillId, rating, review) => fetch('http://localhost:18794/api/rate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillId, rating, review })
  }).then(r => r.json()),
  
  // Leaderboard
  getLeaderboard: () => fetch('http://localhost:18794/api/leaderboard').then(r => r.json()),
  
  // Event listeners (keep for compatibility)
  onShowStatus: (callback) => ipcRenderer.on('show-status', callback)
});
