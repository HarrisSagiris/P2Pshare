const http = require('http');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static('public'));

// Store active rooms
const rooms = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle room creation
    socket.on('create-room', () => {
        const roomId = uuidv4();
        rooms.set(roomId, {
            host: socket.id,
            peers: new Set([socket.id])
        });
        socket.join(roomId);
        socket.emit('room-created', roomId);
    });

    // Handle room joining
    socket.on('join-room', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        room.peers.add(socket.id);
        socket.join(roomId);
        
        // Notify host of new peer
        io.to(room.host).emit('peer-joined', socket.id);
    });

    // Handle WebRTC signaling
    socket.on('signal', ({ peerId, signal }) => {
        io.to(peerId).emit('signal', {
            peerId: socket.id,
            signal: signal
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Clean up rooms
        for (const [roomId, room] of rooms.entries()) {
            if (room.peers.has(socket.id)) {
                room.peers.delete(socket.id);
                
                // If host disconnects, notify all peers
                if (room.host === socket.id) {
                    io.to(roomId).emit('host-disconnected');
                    rooms.delete(roomId);
                } else {
                    // Notify host of peer disconnection
                    io.to(room.host).emit('peer-disconnected', socket.id);
                }
            }
            
            // Remove empty rooms
            if (room.peers.size === 0) {
                rooms.delete(roomId);
            }
        }
    });
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
