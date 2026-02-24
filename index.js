const { Database } = require('./lib/db');
const { P2PServer } = require('./lib/network');
const { AgentNetwork } = require('./lib/core');
const { SkillsManager } = require('./lib/skills');
const http = require('http');

class AgentNetworkSkill {
  constructor(config = {}) {
    this.config = {
      port: config.port || 18793,
      window: config.window || { enabled: false },
      ...config
    };
    
    this.db = null;
    this.p2p = null;
    this.core = null;
    this.skills = null;
    this.running = false;
    this.httpServer = null;
  }
  
  async start() {
    try {
      console.log('Starting Agent Network...');
      
      // Initialize database
      this.db = new Database();
      await this.db.initialize();
      console.log('✓ Database initialized');
      
      // Initialize P2P server
      this.p2p = new P2PServer(this.config.port);
      await this.p2p.start();
      console.log(`✓ P2P server started on port ${this.config.port}`);
      
      // Initialize core module
      this.core = new AgentNetwork(this.db, this.p2p);
      await this.core.start();
      console.log('✓ Core module started');
      
      // Initialize skills manager
      this.skills = new SkillsManager(this.db, this.p2p);
      await this.skills.start();
      console.log('✓ Skills manager started');
      
      // Start HTTP API server
      this.startHttpServer();
      
      this.running = true;
      console.log('\n🎉 Agent Network is running!');
      console.log(`   Node ID: ${this.p2p.peerId}`);
      console.log(`   P2P Port: ${this.config.port}`);
      console.log(`   HTTP API: ${this.config.port + 1}`);
      
      const balance = await this.skills.getBalance(this.p2p.peerId);
      console.log(`   Points: ${balance}\n`);
      
    } catch (error) {
      console.error('Failed to start:', error);
      throw error;
    }
  }
  
  startHttpServer() {
    this.httpServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      
      const sendError = (msg) => {
        res.end(JSON.stringify({ error: msg }));
      };
      
      const sendSuccess = (data) => {
        res.end(JSON.stringify(data));
      };
      
      try {
        if (req.url === '/api/status' && req.method === 'GET') {
          const balance = await this.skills.getBalance(this.p2p.peerId);
          const connections = await this.core.getConnections();
          sendSuccess({
            nodeId: this.p2p.peerId,
            balance,
            connections: connections.length,
            peers: this.p2p.getPeers().length
          });
        } else if (req.url === '/api/connections' && req.method === 'GET') {
          const connections = await this.core.getConnections();
          sendSuccess(connections);
        } else if (req.url === '/api/skills' && req.method === 'GET') {
          const skills = await this.skills.listSkills({ limit: 20 });
          sendSuccess(skills);
        } else if (req.url === '/api/balance' && req.method === 'GET') {
          const balance = await this.skills.getBalance(this.p2p.peerId);
          sendSuccess({ points: balance });
        } else if (req.url === '/api/leaderboard' && req.method === 'GET') {
          const leaderboard = await this.skills.getLeaderboard('skills', 10);
          sendSuccess(leaderboard);
        } else if (req.url === '/api/send' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            const { to, message } = JSON.parse(body);
            await this.core.sendMessage(to, message);
            sendSuccess({ success: true });
          });
        } else if (req.url === '/api/appreciate' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            const { peerId } = JSON.parse(body);
            await this.core.sendAppreciation(peerId);
            sendSuccess({ success: true });
          });
        } else if (req.url.startsWith('/api/publish') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            const { skillPath, price, metadata } = JSON.parse(body);
            const skillId = await this.skills.publish(skillPath, price, metadata);
            sendSuccess({ success: true, skillId });
          });
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (e) {
        sendError(e.message);
      }
    });
    
    this.httpServer.listen(this.config.port + 1, () => {
      console.log(`HTTP API server listening on port ${this.config.port + 1}`);
    });
  }
  
  async stop() {
    if (this.skills) await this.skills.stop();
    if (this.core) await this.core.stop();
    if (this.p2p) await this.p2p.stop();
    if (this.httpServer) {
      this.httpServer.close();
    }
    if (this.db) await this.db.close();
    this.running = false;
    console.log('Agent Network stopped');
  }
  
  get nodeId() {
    return this.p2p ? this.p2p.peerId : null;
  }
}

module.exports = { AgentNetworkSkill };

// Run directly if called from command line
if (require.main === module) {
  const skill = new AgentNetworkSkill({
    port: 18793,
    window: { enabled: false }
  });
  
  skill.start().catch(console.error);
  
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await skill.stop();
    process.exit(0);
  });
}
