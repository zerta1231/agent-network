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
      console.log('\n🎉 Agent Network v1.0.2 is running!');
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
        // Status
        if (req.url === '/api/status' && req.method === 'GET') {
          const balance = await this.skills.getBalance(this.p2p.peerId);
          const connections = await this.core.getConnections();
          sendSuccess({
            nodeId: this.p2p.peerId,
            version: '1.0.2',
            balance,
            connections: connections.length,
            peers: this.p2p.getPeers().length
          });
        }
        // Connections list
        else if (req.url === '/api/connections' && req.method === 'GET') {
          const connections = await this.core.getConnections();
          sendSuccess(connections);
        }
        // All skills marketplace
        else if (req.url === '/api/skills' && req.method === 'GET') {
          const skills = await this.skills.listSkills({ limit: 20 });
          sendSuccess(skills);
        }
        // My published skills
        else if (req.url === '/api/skills/mine' && req.method === 'GET') {
          const skills = await this.skills.getMySkills();
          sendSuccess(skills);
        }
        // Download skill
        else if (req.url === '/api/skills/download' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            const { skillId } = JSON.parse(body);
            const skill = await this.skills.download(skillId);
            sendSuccess(skill);
          });
        }
        // Rate skill
        else if (req.url === '/api/skills/rate' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            const { skillId, rating, review } = JSON.parse(body);
            await this.skills.rate(skillId, rating, review);
            sendSuccess({ success: true });
          });
        }
        // Balance
        else if (req.url === '/api/balance' && req.method === 'GET') {
          const balance = await this.skills.getBalance(this.p2p.peerId);
          sendSuccess({ points: balance });
        }
        // Leaderboard
        else if (req.url === '/api/leaderboard' && req.method === 'GET') {
          const leaderboard = await this.skills.getLeaderboard('skills', 10);
          sendSuccess(leaderboard);
        }
        // Send message
        else if (req.url === '/api/send' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            const { to, message } = JSON.parse(body);
            await this.core.sendMessage(to, message);
            sendSuccess({ success: true });
          });
        }
        // Appreciate
        else if (req.url === '/api/appreciate' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            const { peerId } = JSON.parse(body);
            await this.core.sendAppreciation(peerId);
            sendSuccess({ success: true });
          });
        }
        // Publish skill
        else if (req.url === '/api/publish' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            const { skillPath, price, metadata } = JSON.parse(body);
            const skillId = await this.skills.publish(skillPath, price, metadata);
            // Share with P2P network
            await this.core.shareSkill(skillId, metadata.name || skillPath, metadata.description, price);
            sendSuccess({ success: true, skillId });
          });
        }
        // Share skill (broadcast to P2P)
        else if (req.url === '/api/share' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            const { skillId, skillName, description, price } = JSON.parse(body);
            await this.core.shareSkill(skillId, skillName, description, price);
            sendSuccess({ success: true });
          });
        }
        // Get installed OpenClaw skills
        else if (req.url === '/api/installed-skills' && req.method === 'GET') {
          const fs = require('fs');
          const skillsDir = (process.env.HOME || process.env.USERPROFILE) + '/.openclaw/workspace/skills';
          let skills = [];
          try {
            const dirs = fs.readdirSync(skillsDir);
            for (const dir of dirs) {
              const skillPath = skillsDir + '/' + dir;
              const stat = fs.statSync(skillPath);
              if (stat.isDirectory()) {
                let version = '1.0.0';
                try {
                  const pkgPath = skillPath + '/package.json';
                  if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    version = pkg.version || version;
                  }
                } catch(e) {}
                skills.push({ name: dir, version: version, path: skillPath });
              }
            }
          } catch(e) {}
          sendSuccess(skills);
        }
        // Check for updates
        // Get all discovered agents
        else if (req.url === '/api/discovered-agents' && req.method === 'GET') {
          const allAgents = this.p2p.getAllAgents();
          sendSuccess(allAgents);
        }
        else if (req.url === '/api/check-update' && req.method === 'GET') {
          sendSuccess({ currentVersion: '1.0.5', latestVersion: '1.0.5', updateUrl: 'https://github.com/zerta1231/agent-network' });
        }
        else {
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
