const WebSocket = require('ws');
const crypto = require('crypto');
const EventEmitter = require('events');

class P2PServer extends EventEmitter {
  constructor(port, config = {}) {
    super();
    this.port = port;
    this.config = {
      autoGreet: config.autoGreet !== false, // Default: auto greet new peers
      greetMessage: config.greetMessage || "Hi! I'm OpenClaw Agent. Nice to meet you!",
      ...config
    };
    this.server = null;
    this.connections = new Map(); // peerId -> { ws, info }
    this.peerId = 'node_' + crypto.randomBytes(8).toString('hex');
    this.messageHandlers = new Map();
    this.wss = null;
  }
  
  async start() {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocket.Server({ port: this.port });
      
      this.wss.on('listening', () => {
        console.log(`P2P server listening on port ${this.port}`);
        resolve();
      });
      
      this.wss.on('error', (err) => {
        console.error('P2P server error:', err);
        reject(err);
      });
      
      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });
    });
  }
  
  handleConnection(ws, req) {
    console.log('New P2P connection from:', req.socket.remoteAddress);
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (e) {
        console.error('Failed to parse message:', e.message);
      }
    });
    
    ws.on('close', () => {
      // Remove from connections
      for (const [peerId, conn] of this.connections.entries()) {
        if (conn.ws === ws) {
          this.connections.delete(peerId);
          this.emit('peer_disconnected', peerId);
          break;
        }
      }
    });
    
    ws.on('error', (err) => {
      console.error('Connection error:', err.message);
    });
    
    // Send handshake
    ws.send(JSON.stringify({
      type: 'handshake',
      peerId: this.peerId,
      port: this.port,
      name: 'OpenClaw Agent',
      version: '1.0.0'
    }));
  }
  
  handleMessage(ws, message) {
    const { type, peerId, payload } = message;
    
    switch (type) {
      case 'handshake':
        // Register new peer
        this.connections.set(peerId, { ws, info: payload });
        this.emit('peer_connected', peerId, payload);
        console.log(`Peer connected: ${peerId}`);
        
        // Auto greeting when new peer connects
        if (this.config.autoGreet && payload.name) {
          setTimeout(() => {
            this.sendGreeting(peerId);
          }, 1000); // Wait 1 second for connection to stabilize
        }
        break;
        
      case 'message':
        this.handlePeerMessage(peerId, payload);
        break;
        
      case 'discover_request':
        this.handleDiscoverRequest(ws, peerId);
        break;
        
      case 'skill_share':
        this.handleSkillShare(peerId, payload);
        break;
        
      default:
        if (this.messageHandlers.has(type)) {
          this.messageHandlers.get(type)(payload, peerId);
        }
    }
  }
  
  // Auto greeting when discovering new peer
  sendGreeting(peerId) {
    const greeting = {
      type: 'message',
      from: this.peerId,
      payload: {
        content: this.config.greetMessage,
        messageType: 'greeting',
        timestamp: Date.now()
      }
    };
    
    this.send(peerId, greeting.payload);
    console.log(`Auto greeting sent to ${peerId}`);
    
    // Also emit event for logging
    this.emit('greeting_sent', { to: peerId, message: this.config.greetMessage });
  }
  
  // Handle skill sharing
  handleSkillShare(peerId, payload) {
    const { skillId, skillName, description, price } = payload;
    console.log(`Skill shared by ${peerId}: ${skillName}`);
    
    // Emit event so other modules can handle
    this.emit('skill_shared', { 
      from: peerId, 
      skillId, 
      skillName, 
      description, 
      price 
    });
  }
  
  handlePeerMessage(fromPeerId, payload) {
    const { to, content, messageType } = payload;
    
    if (to === this.peerId) {
      // Message for us
      this.emit('message', { 
        from: fromPeerId, 
        content, 
        type: messageType,
        timestamp: payload.timestamp 
      });
    } else {
      // Forward to recipient
      const conn = this.connections.get(to);
      if (conn && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify({
          type: 'message',
          peerId: this.peerId,
          payload: { from: fromPeerId, content, messageType }
        }));
      }
    }
  }
  
  handleDiscoverRequest(ws, requesterId) {
    // Return list of known peers
    const peers = Array.from(this.connections.keys());
    ws.send(JSON.stringify({
      type: 'discover_response',
      peerId: this.peerId,
      payload: { peers }
    }));
  }
  
  // Connect to a remote peer
  async connect(address) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${address}`);
      
      ws.on('open', () => {
        console.log(`Connected to ${address}`);
        resolve(ws);
      });
      
      ws.on('error', (err) => {
        console.error(`Failed to connect to ${address}:`, err.message);
        reject(err);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (e) {
          console.error('Failed to parse message:', e.message);
        }
      });
    });
  }
  
  // Send message to a specific peer
  send(toPeerId, payload) {
    const conn = this.connections.get(toPeerId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify({
        type: 'message',
        peerId: this.peerId,
        payload
      }));
      return true;
    }
    return false;
  }
  
  // Share a skill with connected peers
  shareSkill(skillId, skillName, description = '', price = 0) {
    const payload = {
      skillId,
      skillName,
      description,
      price,
      sharedAt: Date.now()
    };
    
    this.broadcast({
      type: 'skill_share',
      payload
    });
    
    console.log(`Skill shared: ${skillName}`);
  }
  
  // Broadcast to all connected peers
  broadcast(message) {
    const msgStr = JSON.stringify({
      type: 'broadcast',
      peerId: this.peerId,
      payload: message
    });
    
    for (const [peerId, conn] of this.connections.entries()) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(msgStr);
      }
    }
  }
  
  // Get list of connected peers
  getPeers() {
    return Array.from(this.connections.keys());
  }
  
  // Register message handler
  onMessage(type, handler) {
    this.messageHandlers.set(type, handler);
  }
  
  async stop() {
    // Close all connections
    for (const [peerId, conn] of this.connections.entries()) {
      conn.ws.close();
    }
    this.connections.clear();
    
    // Close server
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss.close(() => {
          console.log('P2P server stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = { P2PServer };
