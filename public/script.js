// Handle file selection and sharing
document.getElementById('shareBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select a file first!');
        return;
    }

    const fileToSend = fileInput.files[0];
    
    // Upload file first
    const formData = new FormData();
    formData.append('file', fileToSend);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Upload failed');
        }

        // Create WebRTC room as host
        const socket = io();
        socket.emit('create-room');

        socket.on('room-created', (roomId) => {
            // Show sharing UI
            document.getElementById('result').classList.remove('hidden');
            document.getElementById('senderStatus').innerText = 'Ready to share';
            
            // Set share link with file ID
            const shareLink = document.getElementById('shareLink');
            const shareLinkUrl = `${window.location.origin}?file=${data.fileId}`;
            shareLink.value = shareLinkUrl;

            // Generate and display QR code
            const qrCodeContainer = document.getElementById('qrCode');
            qrCodeContainer.innerHTML = ''; // Clear previous QR code if any
            
            new QRCode(qrCodeContainer, {
                text: shareLinkUrl,
                width: 128,
                height: 128,
                colorDark: "#FFFFFF",
                colorLight: "#1F2937",
                correctLevel: QRCode.CorrectLevel.H
            });
        });

        socket.on('peer-joined', (peerId) => {
            document.getElementById('senderStatus').innerText = 'Receiver connected';
        });

        socket.on('peer-disconnected', () => {
            document.getElementById('senderStatus').innerText = 'Receiver disconnected';
        });

    } catch (err) {
        alert('Error uploading file: ' + err.message);
        console.error(err);
    }
});

// Check URL for file ID or room ID
window.addEventListener('load', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get('file');
    const roomId = urlParams.get('room');
    
    if (fileId || roomId) {
        document.getElementById('hostSection').classList.add('hidden');
        document.getElementById('receiveSection').classList.remove('hidden');

        if (fileId) {
            // Direct file download
            const downloadLink = document.getElementById('downloadLink');
            downloadLink.href = `/api/download/${fileId}`;
            downloadLink.classList.remove('hidden');
            document.getElementById('receiverStatus').innerText = 'Your file is ready for download';
            document.getElementById('progressBar').style.width = '100%';
        } else if (roomId) {
            // WebRTC room joining
            const socket = io();
            socket.emit('join-room', roomId);

            socket.on('error', (error) => {
                document.getElementById('receiverStatus').innerText = error;
            });

            socket.on('host-disconnected', () => {
                document.getElementById('receiverStatus').innerText = 'Host disconnected';
            });
        }
    }
});
