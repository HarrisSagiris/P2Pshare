const http = require('http');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// MongoDB connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/filetransfer';
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
const conn = mongoose.connection;

// Init GridFS
let gfs;
conn.once('open', () => {
    gfs = Grid(conn.db, mongoose.mongo);
    gfs.collection('uploads');
});

// Create storage engine
const storage = new GridFsStorage({
    url: mongoURI,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            crypto.randomBytes(16, (err, buf) => {
                if (err) {
                    return reject(err);
                }
                const fileId = uuidv4();
                const filename = fileId + path.extname(file.originalname);
                const fileInfo = {
                    filename: filename,
                    bucketName: 'uploads',
                    metadata: {
                        originalName: file.originalname,
                        uploadDate: new Date(),
                        fileId: fileId
                    }
                };
                resolve(fileInfo);
            });
        });
    }
});

const upload = multer({ storage });

// Serve static files from 'public' directory
app.use(express.static('public'));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    const fileId = req.file.metadata.fileId;
    const downloadLink = `${req.protocol}://${req.get('host')}/download/${fileId}`;
    res.json({ success: true, downloadLink });
});

// File download endpoint
app.get('/download/:fileId', async (req, res) => {
    try {
        const file = await gfs.files.findOne({
            'metadata.fileId': req.params.fileId
        });
        
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.set('Content-Type', file.contentType);
        res.set('Content-Disposition', `attachment; filename="${file.metadata.originalName}"`);

        const readstream = gfs.createReadStream(file.filename);
        readstream.pipe(res);
    } catch (error) {
        res.status(500).json({ error: 'Error downloading file' });
    }
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// File cleanup - delete files older than 7 days
setInterval(async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    try {
        const oldFiles = await gfs.files.find({
            'metadata.uploadDate': { $lt: sevenDaysAgo }
        }).toArray();
        
        for (const file of oldFiles) {
            await gfs.remove({ _id: file._id, root: 'uploads' });
        }
    } catch (error) {
        console.error('Error cleaning up old files:', error);
    }
}, 24 * 60 * 60 * 1000); // Run daily

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
