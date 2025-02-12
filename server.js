const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store active connections and their room info
const rooms = new Map();
const clients = new Map();

// Serve static files from 'public' directory
app.use(express.static('public'));

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    const clientId = uuidv4();
    clients.set(ws, clientId);

    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'create-room':
                    const roomId = uuidv4();
                    rooms.set(roomId, {
                        host: clientId,
                        peers: new Set([clientId])
                    });
                    ws.send(JSON.stringify({
                        type: 'room-created',
                        roomId: roomId
                    }));
                    break;

                case 'join-room':
                    const room = rooms.get(data.roomId);
                    if (room) {
                        room.peers.add(clientId);
                        // Notify host about new peer
                        wss.clients.forEach(client => {
                            if (clients.get(client) === room.host) {
                                client.send(JSON.stringify({
                                    type: 'peer-joined',
                                    peerId: clientId
                                }));
                            }
                        });
                    }
                    break;

                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    // Forward WebRTC signaling messages to the intended peer
                    wss.clients.forEach(client => {
                        if (clients.get(client) === data.target) {
                            client.send(JSON.stringify({
                                type: data.type,
                                data: data.data,
                                sender: clientId
                            }));
                        }
                    });
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        const clientId = clients.get(ws);
        console.log('Client disconnected:', clientId);

        // Clean up rooms and notify peers
        rooms.forEach((room, roomId) => {
            if (room.peers.has(clientId)) {
                room.peers.delete(clientId);
                if (room.peers.size === 0) {
                    rooms.delete(roomId);
                } else if (room.host === clientId) {
                    // If host disconnects, notify remaining peers
                    wss.clients.forEach(client => {
                        if (room.peers.has(clients.get(client))) {
                            client.send(JSON.stringify({
                                type: 'host-disconnected'
                            }));
                        }
                    });
                }
            }
        });

        clients.delete(ws);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
