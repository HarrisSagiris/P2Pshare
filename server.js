const http = require('http');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);

// MongoDB connection
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://appleidmusic960:Dataking8@tapsidecluster.oeofi.mongodb.net/';

// Initialize MongoDB connection before setting up routes
let gfs;
let upload;

async function initMongoDB() {
    try {
        await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        const conn = mongoose.connection;
        
        // Init GridFS after connection is established
        gfs = Grid(conn.db, mongoose.mongo);
        gfs.collection('uploads');

        // Create storage engine with file size limit (2GB like WeTransfer)
        const storage = new GridFsStorage({
            url: mongoURI,
            file: (req, file) => {
                return new Promise((resolve, reject) => {
                    const fileId = uuidv4();
                    const filename = fileId + path.extname(file.originalname);
                    const fileInfo = {
                        filename: filename,
                        bucketName: 'uploads',
                        metadata: {
                            originalName: file.originalname,
                            uploadDate: new Date(),
                            fileId: fileId,
                            expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                            downloads: 0,
                            maxDownloads: req.body.maxDownloads || 0, // 0 means unlimited
                            senderEmail: req.body.senderEmail,
                            recipientEmail: req.body.recipientEmail,
                            message: req.body.message
                        }
                    };
                    resolve(fileInfo);
                });
            },
            limits: {
                fileSize: 2 * 1024 * 1024 * 1024 // 2GB
            }
        });

        upload = multer({ storage });
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' directory
app.use(express.static('public'));

// Enhanced file upload endpoint
app.post('/upload', async (req, res) => {
    if (!upload) {
        return res.status(500).json({ error: 'Storage not initialized' });
    }
    
    upload.single('file')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileId = req.file.metadata.fileId;
        const downloadLink = `${req.protocol}://${req.get('host')}/download/${fileId}`;

        // Send email to recipient if email is provided
        if (req.body.recipientEmail) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: req.body.recipientEmail,
                subject: `${req.body.senderEmail || 'Someone'} sent you a file`,
                html: `
                    <h2>You've received a file!</h2>
                    <p>${req.body.message || ''}</p>
                    <p>File: ${req.file.metadata.originalName}</p>
                    <p>Download link: <a href="${downloadLink}">${downloadLink}</a></p>
                    <p>This link will expire in 7 days.</p>
                `
            };

            try {
                await transporter.sendMail(mailOptions);
            } catch (error) {
                console.error('Error sending email:', error);
            }
        }

        res.json({ success: true, downloadLink });
    });
});

// Enhanced file download endpoint
app.get('/download/:fileId', async (req, res) => {
    try {
        const file = await gfs.files.findOne({
            'metadata.fileId': req.params.fileId
        });
        
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Check if file has expired
        if (new Date() > new Date(file.metadata.expiryDate)) {
            await gfs.remove({ _id: file._id, root: 'uploads' });
            return res.status(410).json({ error: 'File has expired' });
        }

        // Check download limits
        if (file.metadata.maxDownloads > 0 && file.metadata.downloads >= file.metadata.maxDownloads) {
            return res.status(403).json({ error: 'Download limit reached' });
        }

        // Update download count
        await gfs.files.updateOne(
            { _id: file._id },
            { $inc: { 'metadata.downloads': 1 } }
        );

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

// Enhanced file cleanup - delete expired files
setInterval(async () => {
    try {
        const expiredFiles = await gfs.files.find({
            'metadata.expiryDate': { $lt: new Date() }
        }).toArray();
        
        for (const file of expiredFiles) {
            await gfs.remove({ _id: file._id, root: 'uploads' });
        }
    } catch (error) {
        console.error('Error cleaning up expired files:', error);
    }
}, 60 * 60 * 1000); // Run hourly

const PORT = process.env.PORT || 3000;

// Initialize MongoDB and start server
initMongoDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize:', err);
});
